// Umumiy yordamchilar (upload, update, delete, list, collection funksiyalari ishlatadi).
// Cloudflare Pages sozlamalari: ADMIN_TOKEN (Secret), GITHUB_TOKEN (Secret), GITHUB_REPO ("user/repo"),
// GITHUB_BRANCH (ixtiyoriy), R2 binding: R2_OMBOR

export const SCHOLAR_MAX = 5000000;        // Google Scholar: har bir fayl 5 MB dan oshmasligi kerak
export const BOOK_MAX = 25 * 1024 * 1024;
export const LANGS = ['uz', 'en', 'ru'];
export const KIND = {
  'jurnal-maqolasi': 'journal', 'konferensiya-maqolasi': 'conf', 'konferensiya-tezisi': 'conf',
  'darslik': 'book', 'oquv-qollanma': 'book', 'monografiya': 'book',
};
export const FIELDS = {
  journal: ['journal_name', 'volume', 'issue', 'pages'],
  conf: ['conference_org', 'conference_place', 'conference_date', 'pages'],
  book: ['publisher', 'publisher_city', 'edition', 'total_pages'],
};
const SHARED = ['journal_name', 'volume', 'issue', 'conference_org', 'conference_place', 'conference_date']; // to'plamdan olinadi
const OWN_KEYS = ['item_type', 'language', 'authors', 'year', 'date', 'collection', 'issn', 'isbn', 'udk', 'bbk', 'doi', 'references',
  'journal_name', 'volume', 'issue', 'pages', 'conference_org', 'conference_place', 'conference_date', 'publisher', 'publisher_city', 'edition', 'total_pages',
  ...LANGS.flatMap((l) => ['title_' + l, 'abstract_' + l, 'keywords_' + l])];
export const OK = {
  issn: /^\d{4}-\d{3}[\dXx]$/,
  isbn: /^(?:\d[- ]?){9}[\dXx]$|^(?:\d[- ]?){12}\d$/,
  doi: /^10\.\d{4,9}\/\S+$/,
  pdf: /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/i,
};

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export class UserError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}
export const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
export const list = (v, sep, maxItems, maxLen) =>
  clean(v, 400000).split(sep).map((s) => s.trim()).filter(Boolean).slice(0, maxItems).map((s) => s.slice(0, maxLen));
export const slugify = (s, fallback = 'maqola') =>
  String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[ʻʼ‘’`'´]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || fallback;
const b64decode = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const b64encode = (s) => { let bin = ''; for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte); return btoa(bin); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Har bir admin funksiyasi shu qobiq orqali o'tadi: sozlamalar, token tekshiruvi, xatolarni JSON qilish.
export function admin(fn) {
  return async (ctx) => {
    const { request, env } = ctx;
    try {
      if (!env.ADMIN_TOKEN || !env.R2_OMBOR || !env.GITHUB_REPO || !env.GITHUB_TOKEN) {
        console.error("Sozlamalar to'liq emas");
        return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
      }
      const given = request.headers.get('X-Admin-Token') || '';
      if (!given || !(await sameSecret(given, env.ADMIN_TOKEN))) { await sleep(700); return json({ success: false, error: "Ruxsat yo'q" }, 401); }
      return await fn(ctx);
    } catch (err) {
      if (err instanceof UserError) return json({ success: false, error: err.message }, err.status);
      console.error(err);
      return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
    }
  };
}

// ---------- GitHub: articles.json ----------
function gh(env) {
  return {
    api: `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`,
    ref: env.GITHUB_BRANCH ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : '',
    h: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'article-portal', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  };
}
export async function readData(env) {
  const { api, ref, h } = gh(env);
  const res = await fetch(api + ref, { headers: h });
  if (!res.ok) throw new Error(`GitHub o'qish xatosi: ${res.status}`);
  const cur = await res.json();
  let text = cur.content ? b64decode(cur.content) : '';
  if (!text) { // 1 MB dan katta fayllarda GitHub content ni bo'sh qaytaradi
    const raw = await fetch(api + ref, { headers: { ...h, Accept: 'application/vnd.github.raw+json' } });
    if (!raw.ok) throw new Error(`GitHub o'qish xatosi: ${raw.status}`);
    text = await raw.text();
  }
  const data = JSON.parse(text);
  if (!Array.isArray(data.articles)) throw new Error("articles.json da 'articles' massivi yo'q");
  if (!Array.isArray(data.collections)) data.collections = [];
  return { data, sha: cur.sha };
}
// fn(data) ma'lumotni o'zgartiradi va natija qaytaradi. Konfliktda yangi ma'lumot bilan qayta ishlaydi.
export async function mutate(env, message, fn) {
  const { api, h } = gh(env);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, sha } = await readData(env);
    const result = fn(data);
    const put = await fetch(api, {
      method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: b64encode(JSON.stringify(data, null, 2) + '\n'), sha, ...(env.GITHUB_BRANCH ? { branch: env.GITHUB_BRANCH } : {}) }),
    });
    if (put.ok) return result;
    if (put.status !== 409 && put.status !== 422) throw new Error(`GitHub yozish xatosi: ${put.status}`);
  }
  throw new Error("articles.json ni yangilab bo'lmadi (konflikt)");
}

// ---------- PDF ----------
export async function checkPdf(file, kind) {
  if (!file || typeof file === 'string') throw new UserError('PDF fayl tanlanmagan');
  const limit = kind === 'book' ? BOOK_MAX : SCHOLAR_MAX;
  if (file.size === 0) throw new UserError("PDF fayl bo'sh");
  if (file.size > limit) throw new UserError(kind === 'book' ? 'PDF hajmi 25 MB dan oshmasligi kerak' : "Google Scholar 5 MB dan katta fayllarni indekslamaydi. PDF hajmini 5 MB dan kichik qiling");
  if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') throw new UserError('Faqat PDF fayl qabul qilinadi');
}

// ---------- Forma -> maqola ----------
const readCollFields = (form, type) => {
  const g = (n, m) => clean(form.get(n), m);
  const name = g('coll_name', 200);
  if (!name) throw new UserError(type === 'journal' ? 'Jurnal nomini kiriting' : 'Konferensiya nomini kiriting');
  const c = { type, name };
  const y = g('coll_year', 4); if (/^\d{4}$/.test(y)) c.year = Number(y);
  if (type === 'journal') { c.journal_name = name; for (const [k, f] of [['volume', 'coll_volume'], ['issue', 'coll_issue']]) { const v = g(f, 60); if (v) c[k] = v; } }
  else { c.conference_org = name; for (const [k, f] of [['conference_place', 'coll_place'], ['conference_date', 'coll_date']]) { const v = g(f, 200); if (v) c[k] = v; } }
  for (const [k, f, m] of [['publisher', 'coll_publisher', 200], ['publisher_city', 'coll_city', 200], ['issn', 'coll_issn', 60], ['isbn', 'coll_isbn', 60]]) { const v = g(f, m); if (v) c[k] = v; }
  if (c.issn && !OK.issn.test(c.issn)) throw new UserError("To'plam ISSN formati noto'g'ri (masalan 1234-5678)");
  if (c.isbn && !OK.isbn.test(c.isbn)) throw new UserError("To'plam ISBN formati noto'g'ri (10 yoki 13 raqam)");
  return c;
};
export const parseCollectionForm = readCollFields;

// Natija: { article (id, pdf siz), coll: null | { id } | { fields } }
export function parseArticle(form) {
  const g = (name, max) => clean(form.get(name), max);
  const type = g('item_type', 40), kind = KIND[type];
  if (!kind) throw new UserError("Material turi noto'g'ri");
  const lang = LANGS.includes(g('language', 2)) ? g('language', 2) : 'uz';
  const article = { item_type: type, language: lang };
  for (const l of LANGS) {
    const t = g('title_' + l, 300), a = g('abstract_' + l, 6000), k = list(form.get('keywords_' + l), /[,;\n]+/, 15, 60);
    if (t) article['title_' + l] = t; if (a) article['abstract_' + l] = a; if (k.length) article['keywords_' + l] = k;
  }
  if (!article['title_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da maqola nomi kiritilmagan`);
  if (!article['abstract_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da annotatsiya kiritilmagan (Google Scholar uchun shart)`);
  if (!article['keywords_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da kamida bitta kalit so'z kiriting`);

  const authors = list(form.get('authors'), /[;\n]+/, 30, 120);
  if (!authors.length) throw new UserError('Kamida bitta muallif kiriting (bir nechta bo\'lsa ";" bilan ajrating)');
  const year = /^\d{4}$/.test(g('year', 4)) ? Number(g('year', 4)) : new Date().getUTCFullYear();
  const dateIn = g('date', 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIn) ? dateIn : new Date().toISOString().slice(0, 10);
  Object.assign(article, { authors, year, date });

  // To'plam: faqat jurnal/konferensiya turlari uchun va galochka qo'yilgan bo'lsa
  let coll = null;
  if (kind !== 'book' && g('coll_on', 3) === 'yes') {
    const sel = g('coll_id', 120);
    if (!sel) throw new UserError("To'plamni tanlang yoki yangisini yozing");
    coll = sel === '__new__' ? { fields: readCollFields(form, kind) } : { id: sel };
  }
  for (const f of FIELDS[kind]) { if (coll && SHARED.includes(f)) continue; const v = g(f, 200); if (v) article[f] = v; }
  if (!coll && kind === 'journal' && !article.journal_name) throw new UserError('Jurnal nomini kiriting');
  if (!coll && kind === 'conf' && !article.conference_org) throw new UserError('Konferensiya nomini kiriting');

  for (const f of ['issn', 'isbn', 'udk', 'bbk']) { const v = g(f, 60); if (v) article[f] = v; }
  if (article.issn && !OK.issn.test(article.issn)) throw new UserError("ISSN formati noto'g'ri (masalan 1234-5678)");
  if (article.isbn && !OK.isbn.test(article.isbn)) throw new UserError("ISBN formati noto'g'ri (10 yoki 13 raqam)");
  const doi = g('doi', 200).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (doi) { if (!OK.doi.test(doi)) throw new UserError("DOI formati noto'g'ri (masalan 10.1234/abcd)"); article.doi = doi; }
  const references = list(form.get('references'), /\n+/, 300, 1000);
  if (references.length) article.references = references;
  return { article, kind, coll };
}

// data ichida to'plamni topadi yoki yaratadi; maqolaga `collection` yozadi. Qaytaradi: to'plam id yoki ''.
export function applyCollection(data, article, coll) {
  delete article.collection;
  if (!coll) return '';
  if (coll.id) {
    if (!data.collections.some((c) => c.id === coll.id)) throw new UserError("Tanlangan to'plam topilmadi");
    return (article.collection = coll.id);
  }
  const f = coll.fields; if (!f.year) f.year = article.year;
  const key = (c) => [c.type, c.name, c.year, c.volume, c.issue].map((x) => String(x ?? '').toLowerCase()).join('|');
  const same = data.collections.find((c) => key(c) === key(f)); // bir xil to'plam ikki marta yaratilmaydi
  if (same) return (article.collection = same.id);
  const base = slugify([f.name, f.year, f.volume && 'tom' + f.volume, f.issue && 'son' + f.issue].filter(Boolean).join(' '), 'toplam');
  let id = base; while (data.collections.some((c) => c.id === id)) id = `${base}-${crypto.randomUUID().slice(0, 4)}`;
  data.collections.unshift({ id, ...f });
  return (article.collection = id);
}

// Mavjud maqolani yangilaydi: forma maydonlari almashadi, id/pdf/pdf_size va noma'lum maydonlar saqlanadi.
export function replaceEditable(existing, fresh) {
  const out = { ...existing };
  for (const k of OWN_KEYS) delete out[k];
  return Object.assign(out, fresh);
}
