// functions/api/upload.js  ->  POST /api/upload
// Kerakli sozlamalar (Cloudflare Pages -> Settings):
//   Variables and Secrets:  ADMIN_TOKEN (Secret), GITHUB_TOKEN (Secret), GITHUB_REPO ("user/repo"), GITHUB_BRANCH (ixtiyoriy)
//   Bindings -> R2 bucket:  R2_OMBOR

const MAX_PDF = 25 * 1024 * 1024; // 25 MB
const LANGS = ['uz', 'en', 'ru'];

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
      console.error('Sozlamalar to\'liq emas');
      return json({ success: false, error: 'Server sozlamalari to\'liq emas' }, 500);
    }

    // 1) Autentifikatsiya
    const given = request.headers.get('X-Admin-Token') || '';
    if (!given || !(await sameSecret(given, env.ADMIN_TOKEN))) {
      return json({ success: false, error: 'Ruxsat yo\'q' }, 401);
    }

    if (!(request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
      return json({ success: false, error: 'Noto\'g\'ri so\'rov turi' }, 415);
    }

    // 2) Maydonlarni o'qish va tekshirish
    const form = await request.formData();
    const file = form.get('file');
    const title = clean(form.get('title'), 300);
    const authors = list(form.get('authors'), /[;\n]+/, 30, 120); // mualliflar ";" yoki yangi qator bilan ajratiladi
    const abstract = clean(form.get('abstract'), 6000);
    const lang = LANGS.includes(form.get('language')) ? form.get('language') : 'uz';

    if (!title) throw new UserError('Maqola nomi kiritilmagan');
    if (!authors.length) throw new UserError('Kamida bitta muallif kiriting (bir nechta bo\'lsa ";" bilan ajrating)');
    if (!abstract) throw new UserError('Annotatsiya kiritilmagan (Google Scholar uchun shart)');
    if (!file || typeof file === 'string') throw new UserError('PDF fayl tanlanmagan');
    if (file.size === 0 || file.size > MAX_PDF) throw new UserError('PDF hajmi 25 MB dan oshmasligi kerak');
    const magic = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (magic !== '%PDF-') throw new UserError('Faqat PDF fayl qabul qilinadi');

    const year = /^\d{4}$/.test(clean(form.get('year'), 4)) ? Number(form.get('year')) : new Date().getUTCFullYear();
    const dateIn = clean(form.get('date'), 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIn) ? dateIn : new Date().toISOString().slice(0, 10);

    const id = `${slugify(title)}-${crypto.randomUUID().slice(0, 6)}`;
    key = `${id}.pdf`;

    const article = {
      id,
      ['title_' + lang]: title,
      authors,
      year,
      date,
      language: lang,
      ['abstract_' + lang]: abstract,
      pdf: key,
    };
    const keywords = list(form.get('keywords'), /[,;\n]+/, 15, 60);
    if (keywords.length) article.keywords_uz = keywords; // build.js shu nomdan foydalanadi
    for (const f of ['journal_name', 'volume', 'issue', 'pages', 'doi', 'collection']) {
      const v = clean(form.get(f), 200);
      if (v) article[f] = v;
    }
    const references = list(form.get('references'), /\n+/, 200, 1000);
    if (references.length) article.references = references;

    // 3) R2 ga yuklash
    await env.R2_OMBOR.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });

    // 4) GitHub dagi articles.json ni yangilash (konflikt bo'lsa qayta urinadi)
    const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`;
    const ref = env.GITHUB_BRANCH ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : '';
    const gh = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'article-portal',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    for (let attempt = 0; attempt < 3 && !committed; attempt++) {
      const getRes = await fetch(api + ref, { headers: gh });
      if (!getRes.ok) throw new Error(`GitHub o'qish xatosi: ${getRes.status}`);
      const file = await getRes.json();
      const data = JSON.parse(b64decode(file.content));
      if (!Array.isArray(data.articles)) throw new Error("articles.json da 'articles' massivi yo'q");

      data.articles.unshift(article);

      const putRes = await fetch(api, {
        method: 'PUT',
        headers: { ...gh, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Yangi maqola: ${id}`,
          content: b64encode(JSON.stringify(data, null, 2) + '\n'),
          sha: file.sha,
          ...(env.GITHUB_BRANCH ? { branch: env.GITHUB_BRANCH } : {}),
        }),
      });
      if (putRes.ok) committed = true;
      else if (putRes.status !== 409 && putRes.status !== 422) throw new Error(`GitHub yozish xatosi: ${putRes.status}`);
    }
    if (!committed) throw new Error('articles.json ni yangilab bo\'lmadi (konflikt)');

    return json({ success: true, id });
  } catch (err) {
    if (key && !committed) {
      try { await env.R2_OMBOR.delete(key); } catch (_) {}
    }
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: 'Server xatosi. Keyinroq qayta urinib ko\'ring.' }, 500);
  }
}
