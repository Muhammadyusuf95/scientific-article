// functions/api/upload.js  ->  POST /api/upload  (multipart/form-data)
// Sozlamalar (Cloudflare Pages): ADMIN_TOKEN (Secret), GITHUB_TOKEN (Secret), GITHUB_REPO ("user/repo"),
// GITHUB_BRANCH (ixtiyoriy), R2 binding: R2_OMBOR
//
// Qabul qilinadigan maydonlar: item_type, language, title_uz/en/ru, abstract_*, keywords_*, authors, year, date,
// tur maydonlari (journal_name, volume, issue, pages, conference_*, publisher*, edition, total_pages), issn, isbn, udk, bbk, doi,
// references, file (PDF), checks=yes.
// To'plam (ixtiyoriy, faqat jurnal/konferensiya): coll_on=yes, coll_id = mavjud to'plam id si yoki "__new__",
// "__new__" bo'lsa: coll_name, coll_year, coll_volume, coll_issue, coll_place, coll_date, coll_publisher, coll_city, coll_issn, coll_isbn.
import {
  SCHOLAR_MAX, admin, json, UserError, slugify, mutate, checkPdf, parseArticle, applyCollection,
} from '../_lib/common.js';

export const onRequestPost = admin(async ({ request, env }) => {
  if (!(request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
    throw new UserError("Noto'g'ri so'rov turi", 415);
  }
  const form = await request.formData();

  // 1) Hammasi R2 ga yozishdan OLDIN tekshiriladi
  const { article, kind, coll } = parseArticle(form);
  const file = form.get('file');
  if (form.get('checks') !== 'yes') throw new UserError('PDF tayyorgarligi tasdiqlanmagan');
  await checkPdf(file, kind);

  const lang = article.language;
  const id = `${slugify(article['title_' + lang])}-${crypto.randomUUID().slice(0, 6)}`;
  const key = `${id}.pdf`;
  const record = { id, ...article, pdf: key, pdf_size: file.size };

  // 2) PDF ni R2 ga yuklash
  await env.R2_OMBOR.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });

  // 3) articles.json ni yangilash. Muvaffaqiyatsiz bo'lsa, R2 dagi PDF o'chiriladi (yetim fayl qolmaydi).
  try {
    const collectionId = await mutate(env, `Yangi nashr: ${id}`, (data) => {
      const cid = applyCollection(data, record, coll);
      if (cid) {
        const c = data.collections.find((x) => x.id === cid);
        if (c && c.type !== kind) throw new UserError("To'plam turi maqola turiga mos emas (jurnal/konferensiya)");
      }
      data.articles.unshift(record);
      return cid;
    });
    return json({ success: true, id, collection: collectionId || null, scholar_pdf: file.size <= SCHOLAR_MAX });
  } catch (err) {
    try { await env.R2_OMBOR.delete(key); } catch (_) { /* e'tiborsiz */ }
    throw err;
  }
});
