// functions/api/edit.js  ->  POST /api/edit  (multipart/form-data)
// Mavjud nashrni tahrirlaydi. Maydonlar /api/upload bilan bir xil + majburiy `id`.
// `file` (PDF) ixtiyoriy: berilsa, PDF almashtiriladi (eskisi R2 da deleted/ papkasiga arxivlanadi), checks=yes shart.
// Yil va sana bo'sh yuborilsa, eski qiymat saqlanadi. id, pdf va noma'lum maydonlar o'zgarmaydi.
import {
  admin, json, UserError, ID_RE, SCHOLAR_MAX, clean, mutate, checkPdf, parseArticle, applyCollection, replaceEditable, archiveObject,
} from '../_lib/common.js';

export const onRequestPost = admin(async ({ request, env }) => {
  if (!(request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
    throw new UserError("Noto'g'ri so'rov turi", 415);
  }
  const form = await request.formData();
  const id = clean(form.get('id'), 120);
  if (!ID_RE.test(id)) throw new UserError("Nashr ID si noto'g'ri");

  // 1) Hammasi saqlashdan OLDIN tekshiriladi
  const { article, kind, coll } = parseArticle(form);
  const file = form.get('file');
  const hasFile = !!file && typeof file !== 'string' && file.size > 0;
  let newKey = null;
  if (hasFile) {
    if (form.get('checks') !== 'yes') throw new UserError('PDF tayyorgarligi tasdiqlanmagan');
    await checkPdf(file, kind);
    newKey = `${id}-${crypto.randomUUID().slice(0, 4)}.pdf`;
    await env.R2_OMBOR.put(newKey, await file.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });
  }
  const keepYear = !clean(form.get('year'), 4);
  const keepDate = !clean(form.get('date'), 10);

  // 2) articles.json yangilanadi. Xato bo'lsa, yangi PDF o'chiriladi.
  let res;
  try {
    res = await mutate(env, `Nashr tahrirlandi: ${id}`, (data) => {
      const i = data.articles.findIndex((a) => a.id === id);
      if (i < 0) throw new UserError('Nashr topilmadi', 404);
      const existing = data.articles[i];

      const fresh = { ...article };
      if (keepYear && existing.year) fresh.year = existing.year;
      if (keepDate && existing.date) fresh.date = existing.date;

      const merged = replaceEditable(existing, fresh);
      const cid = applyCollection(data, merged, coll);
      if (cid) {
        const c = data.collections.find((x) => x.id === cid);
        if (c && c.type !== kind) throw new UserError("To'plam turi maqola turiga mos emas (jurnal/konferensiya)");
      }

      let oldPdf = null;
      if (newKey) { oldPdf = existing.pdf || null; merged.pdf = newKey; merged.pdf_size = file.size; }
      data.articles[i] = merged;

      // Maqola to'plamdan chiqarilgan yoki boshqasiga o'tkazilgan bo'lsa, bo'sh qolgan eski to'plam olib tashlanadi
      let removed = '';
      const oc = existing.collection;
      if (oc && oc !== cid && !data.articles.some((a) => a.collection === oc)) {
        const ci = data.collections.findIndex((c) => c.id === oc);
        if (ci >= 0) { data.collections.splice(ci, 1); removed = oc; }
      }
      const pdfShared = !!oldPdf && data.articles.some((a) => a.pdf === oldPdf);
      return { cid, oldPdf, pdfShared, removed };
    });
  } catch (err) {
    if (newKey) { try { await env.R2_OMBOR.delete(newKey); } catch (_) { /* e'tiborsiz */ } }
    throw err;
  }

  // 3) Eski PDF arxivlanadi (xato bo'lsa ham nashr allaqachon yangilangan, PDF R2 da qoladi)
  let archived = true;
  if (res.oldPdf && res.oldPdf !== newKey && !res.pdfShared) {
    try { archived = await archiveObject(env, res.oldPdf); } catch (e) { archived = false; console.error('Arxivlash xatosi', e); }
  }
  return json({
    success: true, id, collection: res.cid || null, collection_removed: res.removed || null,
    pdf_replaced: !!newKey, archived, scholar_pdf: newKey ? file.size <= SCHOLAR_MAX : undefined,
  });
});
