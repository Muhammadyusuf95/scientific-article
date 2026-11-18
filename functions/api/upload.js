// functions/api/upload.js -> POST /api/upload (Yangi qo'shish, Tahrirlash va To'plamlar)
import {
  json, clean, slugify, UserError, PDF_NAME, ID_RE, isAdmin, readData, updateData, ghReady,
} from '../../lib/common.js';

const SCHOLAR_MAX = 5000000;
const BOOK_MAX = 25 * 1024 * 1024;
const LANGS = ['uz', 'en', 'ru'];
const KIND = {
  'jurnal-maqolasi': 'journal', 'konferensiya-maqolasi': 'conf', 'konferensiya-tezisi': 'conf',
  'darslik': 'book', 'oquv-qollanma': 'book', 'monografiya': 'book',
};
const FIELDS = {
  journal: ['journal_name', 'volume', 'issue', 'pages'],
  conf: ['conference_org', 'conference_place', 'conference_date', 'pages'],
  book: ['publisher', 'publisher_city', 'edition', 'total_pages'],
};
const ORCID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const OK = {
  issn: /^\d{4}-\d{3}[\dXx]$/,
  isbn: /^(?:\d[- ]?){9}[\dXx]$|^(?:\d[- ]?){12}\d$/,
  doi: /^10\.\d{4,9}\/\S+$/,
};

const list = (v, sep, maxItems, maxLen) =>
  clean(v, 60000).split(sep).map((s) => s.trim()).filter(Boolean).slice(0, maxItems).map((s) => s.slice(0, maxLen));

// Muallif: ortiqcha bo'shliqlarni olib tashlash
const normAuthor = (s) => s.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();

// Adabiyot: raqamlash, ortiqcha bo'shliq va kuzatuv (utm) parametrlarini tozalash
function cleanRef(r) {
  let s = r.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:\[\d{1,3}\]|\d{1,3}\s*[.)])\s*/, '');
  s = s.replace(/https?:\s+\/\//g, (m) => m.replace(/\s+/g, ''));
  s = s.replace(/https?:\/\/\S+/g, (u) => u
    .replace(/([?&])(?:utm_[a-z]+|fbclid|gclid|yclid)(?:=[^&\s]*)?(&)?/gi, (m, p1, p2) => (p2 ? p1 : ''))
    .replace(/[?&]$/, ''));
  s = s.replace(/\s+,/g, ',');
  return s.trim();
}

export async function onRequestPost({ request, env }) {
  let key = null;
  let wrote = false;
  let backup = null;
  try {
    if (!env.ADMIN_TOKEN || !env.R2_OMBOR || !ghReady(env)) {
      return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    }
    if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    if (!(request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
      return json({ success: false, error: "Noto'g'ri so'rov turi" }, 415);
    }

    const form = await request.formData();
    const g = (name, max) => clean(form.get(name), max);
    const editId = g('edit_id', 120);
    if (editId && !ID_RE.test(editId)) throw new UserError("Tahrirlanayotgan nashr ID si noto'g'ri");

    const type = g('item_type', 40);
    const kind = KIND[type];
    if (!kind) throw new UserError("Material turi noto'g'ri");
    const lang = LANGS.includes(g('language', 2)) ? g('language', 2) : 'uz';

    const article = { id: editId || '', item_type: type, language: lang };
    for (const l of LANGS) {
      const t = g('title_' + l, 300), a = g('abstract_' + l, 6000), k = list(form.get('keywords_' + l), /[,;\n]+/, 15, 60);
      if (t) article['title_' + l] = t.replace(/\s+/g, ' ');
      if (a) article['abstract_' + l] = a;
      if (k.length) article['keywords_' + l] = k;
    }
    if (!article['title_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da maqola nomi kiritilmagan`);
    if (!article['abstract_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da annotatsiya kiritilmagan (Google Scholar uchun shart)`);
    if (!article['keywords_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da kamida bitta kalit so'z kiriting`);

    const authors = list(form.get('authors'), /[;\n]+/, 30, 120).map(normAuthor).filter(Boolean);
    if (!authors.length) throw new UserError('Kamida bitta muallif kiriting (bir nechta bo\'lsa ";" bilan ajrating)');
    const year = /^\d{4}$/.test(g('year', 4)) ? Number(g('year', 4)) : new Date().getUTCFullYear();
    const dateIn = g('date', 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIn) ? dateIn : '';
    if (date && Number(date.slice(0, 4)) !== year) throw new UserError(`Nashr yili (${year}) va nashr sanasi (${date}) bir-biriga mos emas`);
    Object.assign(article, { authors, year });

    // Mualliflar haqida: har bir qator tartib bo'yicha bitta muallifga mos ("Ish joyi | ORCID")
    const infoLines = clean(form.get('author_info'), 20000).split('\n').map((s) => s.trim());
    const info = authors.map((n, i) => {
      const [org = '', orcidRaw = ''] = (infoLines[i] || '').split('|').map((x) => x.trim());
      const orcid = orcidRaw.replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
      if (orcid && !ORCID.test(orcid)) throw new UserError(`${i + 1}-muallif ORCID raqami noto'g'ri (namuna: 0000-0002-1825-0097)`);
      return { ...(org ? { org: org.slice(0, 300) } : {}), ...(orcid ? { orcid } : {}) };
    });
    if (info.some((x) => x.org || x.orcid)) article.author_info = info;
    const section = g('section', 120).replace(/\s+/g, ' ');
    if (section) article.section = section;
    const field = g('field', 120).replace(/\s+/g, ' ');
    if (field) article.field = field;
    if (date) article.date = date;

    for (const f of FIELDS[kind]) { const v = g(f, 200); if (v) article[f] = v; }
    if (article.pages) article.pages = article.pages.replace(/\s*[-–—]\s*/, '-');
    if (kind === 'journal' && !article.journal_name) throw new UserError('Jurnal nomini kiriting');
    if (kind === 'conf' && !article.conference_org) throw new UserError('Konferensiya nomini kiriting');

    for (const f of ['issn', 'isbn', 'udk', 'bbk']) { const v = g(f, 60); if (v) article[f] = v; }
    if (article.issn && !OK.issn.test(article.issn)) throw new UserError("ISSN formati noto'g'ri (masalan 1234-5678)");
    if (article.isbn && !OK.isbn.test(article.isbn)) throw new UserError("ISBN formati noto'g'ri (10 yoki 13 raqam)");
    const doi = g('doi', 200).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    if (doi) {
      if (!OK.doi.test(doi)) throw new UserError("DOI formati noto'g'ri (masalan 10.1234/abcd)");
      article.doi = doi;
    }

    // To'plam (Konferensiya yoki Jurnal to'plami)
    const collIdIn = g('collection_id', 120) || g('collection', 120);
    const collNameIn = g('collection_name', 200);
    const collTypeIn = ['conf', 'journal'].includes(g('collection_type', 20)) ? g('collection_type', 20) : (kind === 'conf' ? 'conf' : 'journal');
    let newCollectionObj = null;
    if (collNameIn) {
      const cid = collIdIn || slugify(collNameIn);
      article.collection = cid;
      newCollectionObj = { id: cid, name: collNameIn, type: collTypeIn };
    } else if (collIdIn) {
      article.collection = collIdIn;
    }

    // Foydalanilgan adabiyotlar (References): har bir manba alohida qatorda
    const seenRefs = new Set();
    const references = list(form.get('references'), /\n+/, 300, 1500)
      .map(cleanRef)
      .filter((r) => r.length >= 5 && !seenRefs.has(r.toLowerCase()) && seenRefs.add(r.toLowerCase()));
    if (references.length) article.references = references;
    if (form.get('references_auto') === 'yes' && references.length) article.references_auto = true;

    const file = form.get('file');
    const hasNewFile = file && typeof file !== 'string' && file.size > 0;
    if (!editId && !hasNewFile) throw new UserError('PDF fayl tanlanmagan');

    let bytes = null;
    if (hasNewFile) {
      if (form.get('checks') !== 'yes') throw new UserError('PDF tayyorgarligi tasdiqlanmagan');
      const limit = kind === 'book' ? BOOK_MAX : SCHOLAR_MAX;
      if (file.size > limit) {
        throw new UserError(kind === 'book'
          ? 'PDF hajmi 25 MB dan oshmasligi kerak'
          : 'Google Scholar 5 MB dan katta fayllarni indekslamaydi. PDF hajmini 5 MB dan kichik qiling');
      }
      bytes = await file.arrayBuffer();
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new UserError('Faqat PDF fayl qabul qilinadi');
    }

    if (!article.id) article.id = `${slugify(article['title_' + lang])}-${crypto.randomUUID().slice(0, 6)}`;

    // Tahrirlashda avvalgi yozuvni o'qib olamiz (PDF nomi o'zgarmasligi uchun)
    let prev = null;
    if (editId) {
      const { data } = await readData(env);
      prev = data.articles.find((x) => x.id === editId) || null;
      if (!prev) throw new UserError('Tahrirlanayotgan maqola topilmadi');
    }

    if (hasNewFile) {
      // PDF manzili DOIMIY: almashtirilganda ham nom o'zgarmaydi, eski nusxa "deleted/" ga arxivlanadi.
      key = prev && prev.pdf && PDF_NAME.test(prev.pdf) ? prev.pdf : `${article.id}.pdf`;
      const old = await env.R2_OMBOR.get(key);
      if (old) {
        backup = await old.arrayBuffer();
        await env.R2_OMBOR.put(`deleted/${Date.now()}-${key}`, backup, { httpMetadata: { contentType: 'application/pdf' } });
      }
      await env.R2_OMBOR.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
      wrote = true;
      article.pdf = key;
      article.pdf_size = file.size;
      const pp = parseInt(g('pdf_pages', 5), 10);
      if (pp > 0 && pp < 5000) article.pdf_pages = pp;
    }

    await updateData(env, editId ? `Tahrirlandi: ${article.id}` : `Yangi nashr: ${article.id}`, (data) => {
      if (newCollectionObj) {
        const cIdx = data.collections.findIndex((c) => c.id === newCollectionObj.id);
        if (cIdx >= 0) data.collections[cIdx] = { ...data.collections[cIdx], name: newCollectionObj.name, type: newCollectionObj.type };
        else data.collections.push(newCollectionObj);
      }
      if (editId) {
        const idx = data.articles.findIndex((x) => x.id === editId);
        if (idx === -1) throw new UserError('Tahrirlanayotgan maqola topilmadi');
        const p = data.articles[idx];
        const keep = {};
        for (const f of ['pdf', 'pdf_size', 'pdf_pages', 'pdf_aliases', 'created']) if (p[f] !== undefined) keep[f] = p[f];
        data.articles[idx] = { ...keep, ...article, id: editId, updated: new Date().toISOString().slice(0, 10) };
        if (!hasNewFile) { data.articles[idx].pdf = p.pdf; data.articles[idx].pdf_size = p.pdf_size; }
      } else {
        article.created = new Date().toISOString().slice(0, 10);
        data.articles.unshift(article);
      }
    });

    return json({ success: true, id: article.id, scholar_pdf: !article.pdf_size || article.pdf_size <= SCHOLAR_MAX });
  } catch (err) {
    // Xato bo'lsa, R2 ni avvalgi holatiga qaytaramiz
    if (wrote && key) {
      try {
        if (backup) await env.R2_OMBOR.put(key, backup, { httpMetadata: { contentType: 'application/pdf' } });
        else await env.R2_OMBOR.delete(key);
      } catch (_) {}
    }
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
