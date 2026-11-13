// functions/api/upload.js  ->  POST /api/upload
// Sozlamalar (Cloudflare Pages): ADMIN_TOKEN (Secret), GITHUB_TOKEN (Secret), GITHUB_REPO ("user/repo"),
// GITHUB_BRANCH (ixtiyoriy), R2 binding: R2_OMBOR

const SCHOLAR_MAX = 5000000;        // Google Scholar: har bir fayl 5 MB dan oshmasligi kerak
const BOOK_MAX = 25 * 1024 * 1024;  // kitob turlari uchun (Scholar saytdan indekslamaydi, lekin yuklash mumkin)
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
const OK = {
  issn: /^\d{4}-\d{3}[\dXx]$/,
  isbn: /^(?:\d[- ]?){9}[\dXx]$|^(?:\d[- ]?){12}\d$/,
  doi: /^10\.\d{4,9}\/\S+$/,
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
class UserError extends Error {}

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}
const clean = (v, max) =>
  String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const list = (v, sep, maxItems, maxLen) =>
  clean(v, 20000).split(sep).map((s) => s.trim()).filter(Boolean).slice(0, maxItems).map((s) => s.slice(0, maxLen));
const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[ʻʼ‘’`'´]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'maqola';
const b64decode = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const b64encode = (s) => {
  let bin = '';
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};

export async function onRequestPost({ request, env }) {
  let key = null;
  let committed = false;
  try {
    if (!env.ADMIN_TOKEN || !env.R2_OMBOR || !env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      console.error("Sozlamalar to'liq emas");
      return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    }
    const given = request.headers.get('X-Admin-Token') || '';
    if (!given || !(await sameSecret(given, env.ADMIN_TOKEN))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    if (!(request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
      return json({ success: false, error: "Noto'g'ri so'rov turi" }, 415);
    }

    const form = await request.formData();
    const g = (name, max) => clean(form.get(name), max);

    // --- Tur va asosiy til ---
    const type = g('item_type', 40);
    const kind = KIND[type];
    if (!kind) throw new UserError("Material turi noto'g'ri");
    const lang = LANGS.includes(g('language', 2)) ? g('language', 2) : 'uz';

    // --- Ko'p tilli maydonlar: asosiy tilda sarlavha, annotatsiya, kalit so'z majburiy; qolgan tillar ixtiyoriy ---
    const article = { id: '', item_type: type, language: lang };
    for (const l of LANGS) {
      const t = g('title_' + l, 300), a = g('abstract_' + l, 6000), k = list(form.get('keywords_' + l), /[,;\n]+/, 15, 60);
      if (t) article['title_' + l] = t;
      if (a) article['abstract_' + l] = a;
      if (k.length) article['keywords_' + l] = k;
    }
    if (!article['title_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da maqola nomi kiritilmagan`);
    if (!article['abstract_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da annotatsiya kiritilmagan (Google Scholar uchun shart)`);
    if (!article['keywords_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da kamida bitta kalit so'z kiriting`);

    // --- Mualliflar, yil, sana ---
    const authors = list(form.get('authors'), /[;\n]+/, 30, 120);
    if (!authors.length) throw new UserError('Kamida bitta muallif kiriting (bir nechta bo\'lsa ";" bilan ajrating)');
    const year = /^\d{4}$/.test(g('year', 4)) ? Number(g('year', 4)) : new Date().getUTCFullYear();
    const dateIn = g('date', 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIn) ? dateIn : new Date().toISOString().slice(0, 10);
    Object.assign(article, { authors, year, date });

    // --- Turga xos maydonlar ---
    for (const f of FIELDS[kind]) { const v = g(f, 200); if (v) article[f] = v; }
    if (kind === 'journal' && !article.journal_name) throw new UserError('Jurnal nomini kiriting');
    if (kind === 'conf' && !article.conference_org) throw new UserError('Konferensiya nomini kiriting');

    // --- Ixtiyoriy identifikatorlar (kiritilsa, formati tekshiriladi: noto'g'ri bibliografik ma'lumot indekslashga zarar qiladi) ---
    for (const f of ['issn', 'isbn', 'udk', 'bbk']) { const v = g(f, 60); if (v) article[f] = v; }
    if (article.issn && !OK.issn.test(article.issn)) throw new UserError("ISSN formati noto'g'ri (masalan 1234-5678)");
    if (article.isbn && !OK.isbn.test(article.isbn)) throw new UserError("ISBN formati noto'g'ri (10 yoki 13 raqam)");
    const doi = g('doi', 200).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    if (doi) {
      if (!OK.doi.test(doi)) throw new UserError("DOI formati noto'g'ri (masalan 10.1234/abcd)");
      article.doi = doi;
    }
    const coll = g('collection', 200); if (coll) article.collection = coll;
    const references = list(form.get('references'), /\n+/, 300, 1000);
    if (references.length) article.references = references;

    // --- PDF tekshiruvi ---
    const file = form.get('file');
    if (!file || typeof file === 'string') throw new UserError('PDF fayl tanlanmagan');
    if (form.get('checks') !== 'yes') throw new UserError('PDF tayyorgarligi tasdiqlanmagan');
    const limit = kind === 'book' ? BOOK_MAX : SCHOLAR_MAX;
    if (file.size === 0) throw new UserError("PDF fayl bo'sh");
    if (file.size > limit) {
      throw new UserError(kind === 'book'
        ? 'PDF hajmi 25 MB dan oshmasligi kerak'
        : "Google Scholar 5 MB dan katta fayllarni indekslamaydi. PDF hajmini 5 MB dan kichik qiling");
    }
    if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') throw new UserError('Faqat PDF fayl qabul qilinadi');

    article.id = `${slugify(article['title_' + lang])}-${crypto.randomUUID().slice(0, 6)}`;
    key = `${article.id}.pdf`;
    article.pdf = key;
    article.pdf_size = file.size;

    // --- R2 ga yuklash ---
    await env.R2_OMBOR.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });

    // --- GitHub: articles.json ni yangilash (konfliktda qayta urinadi) ---
    const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`;
    const ref = env.GITHUB_BRANCH ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : '';
    const gh = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'article-portal',
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    };
    for (let attempt = 0; attempt < 3 && !committed; attempt++) {
      const getRes = await fetch(api + ref, { headers: gh });
      if (!getRes.ok) throw new Error(`GitHub o'qish xatosi: ${getRes.status}`);
      const cur = await getRes.json();
      let text = cur.content ? b64decode(cur.content) : '';
      if (!text) { // 1 MB dan katta fayllarda GitHub content ni bo'sh qaytaradi
        const raw = await fetch(api + ref, { headers: { ...gh, Accept: 'application/vnd.github.raw+json' } });
        if (!raw.ok) throw new Error(`GitHub o'qish xatosi: ${raw.status}`);
        text = await raw.text();
      }
      const data = JSON.parse(text);
      if (!Array.isArray(data.articles)) throw new Error("articles.json da 'articles' massivi yo'q");
      data.articles.unshift(article);
      const putRes = await fetch(api, {
        method: 'PUT',
        headers: { ...gh, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Yangi nashr: ${article.id}`,
          content: b64encode(JSON.stringify(data, null, 2) + '\n'),
          sha: cur.sha,
          ...(env.GITHUB_BRANCH ? { branch: env.GITHUB_BRANCH } : {}),
        }),
      });
      if (putRes.ok) committed = true;
      else if (putRes.status !== 409 && putRes.status !== 422) throw new Error(`GitHub yozish xatosi: ${putRes.status}`);
    }
    if (!committed) throw new Error("articles.json ni yangilab bo'lmadi (konflikt)");

    return json({ success: true, id: article.id, scholar_pdf: file.size <= SCHOLAR_MAX });
  } catch (err) {
    if (key && !committed) { try { await env.R2_OMBOR.delete(key); } catch (_) {} }
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
