// functions/_lib/common.js - barcha /api/* funksiyalari uchun umumiy xavfsizlik, tekshiruv va GitHub yordamchilari.
export const SCHOLAR_MAX = 5000000;
export const BOOK_MAX = 25 * 1024 * 1024;
export const LANGS = ['uz', 'en', 'ru'];
export const KIND = {
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
export const PDF_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/i;
export const ID_RE = /^[a-z0-9-]{1,120}$/;

export class UserError extends Error {}
export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

export const clean = (v, max) =>
  String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const list = (v, sep, maxItems, maxLen) =>
  clean(v, 20000).split(sep).map((s) => s.trim()).filter(Boolean).slice(0, maxItems).map((s) => s.slice(0, maxLen));
export const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[ʻʼ‘’`'´]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'maqola';
const b64decode = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const b64encode = (s) => {
  let bin = '';
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}

export async function verifyAccess(request, env) {
  try {
    const jwt = request.headers.get('Cf-Access-Jwt-Assertion') || '';
    const [h, p, s] = jwt.split('.');
    if (!h || !p || !s) return false;
    const header = JSON.parse(new TextDecoder().decode(b64u(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64u(p)));
    if (header.alg !== 'RS256') return false;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return false;
    if (![].concat(payload.aud || []).includes(env.ACCESS_AUD)) return false;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;
    const certs = await (await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600 } })).json();
    const jwk = (certs.keys || []).find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(`${h}.${p}`));
  } catch (_) {
    return false;
  }
}

export async function assertAdmin(request, env) {
  if (!env.ADMIN_TOKEN || (!!env.ACCESS_TEAM_DOMAIN !== !!env.ACCESS_AUD)) {
    console.error("Autentifikatsiya sozlamalari noto'g'ri (ADMIN_TOKEN yoki ACCESS_*)");
    return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
  }
  const deny = async () => { await sleep(400); return json({ success: false, error: "Ruxsat yo'q" }, 401); };
  if (env.ACCESS_TEAM_DOMAIN && !(await verifyAccess(request, env))) return deny();
  const given = request.headers.get('X-Admin-Token') || '';
  if (!given || !(await sameSecret(given, env.ADMIN_TOKEN))) return deny();
  return null;
}

const cfg = (env) => ({
  url: `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`,
  branch: env.GITHUB_BRANCH || '',
  headers: {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'article-portal',
    Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
  },
});

export async function readArticles(env) {
  const c = cfg(env);
  const r = await fetch(c.url + (c.branch ? `?ref=${encodeURIComponent(c.branch)}` : ''), { headers: c.headers });
  if (!r.ok) throw new Error(`GitHub o'qish xatosi: ${r.status}`);
  const meta = await r.json();
  let b64 = meta.content;
  if (!b64) {
    const b = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/git/blobs/${meta.sha}`, { headers: c.headers });
    if (!b.ok) throw new Error(`GitHub blob xatosi: ${b.status}`);
    b64 = (await b.json()).content;
  }
  const data = JSON.parse(b64decode(b64));
  if (!Array.isArray(data.articles)) throw new Error("articles.json da 'articles' massivi yo'q");
  if (!Array.isArray(data.collections)) data.collections = [];
  return { data, sha: meta.sha };
}

export async function updateArticles(env, mutate, message) {
  const c = cfg(env);
  for (let i = 0; i < 3; i++) {
    const { data, sha } = await readArticles(env);
    const result = mutate(data);
    const put = await fetch(c.url, {
      method: 'PUT',
      headers: { ...c.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(message).slice(0, 200),
        content: b64encode(JSON.stringify(data, null, 2) + '\n'),
        sha,
        ...(c.branch ? { branch: c.branch } : {}),
      }),
    });
    if (put.ok) return result;
    if (put.status !== 409 && put.status !== 422) throw new Error(`GitHub yozish xatosi: ${put.status}`);
  }
  throw new Error("articles.json ni yangilab bo'lmadi (konflikt)");
}

export async function archiveObject(env, key) {
  if (!PDF_NAME.test(key)) return;
  const o = await env.R2_OMBOR.get(key);
  if (!o) return;
  await env.R2_OMBOR.put(`deleted/${Date.now()}-${key}`, await o.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });
  await env.R2_OMBOR.delete(key);
}

export function parseArticle(form) {
  const g = (n, m) => clean(form.get(n), m);
  const type = g('item_type', 40);
  const kind = KIND[type];
  if (!kind) throw new UserError("Material turi noto'g'ri");
  const lang = LANGS.includes(g('language', 2)) ? g('language', 2) : 'uz';
  const a = { item_type: type, language: lang };

  for (const l of LANGS) {
    const t = g('title_' + l, 300), ab = g('abstract_' + l, 6000), k = list(form.get('keywords_' + l), /[,;\n]+/, 15, 60);
    if (t) a['title_' + l] = t;
    if (ab) a['abstract_' + l] = ab;
    if (k.length) a['keywords_' + l] = k;
  }
  if (!a['title_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da maqola nomi kiritilmagan`);
  if (!a['abstract_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da annotatsiya kiritilmagan (Google Scholar uchun shart)`);
  if (!a['keywords_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da kamida bitta kalit so'z kiriting`);

  const authors = list(form.get('authors'), /[;\n]+/, 30, 120);
  if (!authors.length) throw new UserError('Kamida bitta muallif kiriting (bir nechta bo\'lsa ";" bilan ajrating)');
  const year = /^\d{4}$/.test(g('year', 4)) ? Number(g('year', 4)) : new Date().getUTCFullYear();
  const dateIn = g('date', 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIn) ? dateIn : new Date().toISOString().slice(0, 10);
  Object.assign(a, { authors, year, date });

  for (const f of FIELDS[kind]) { const v = g(f, 200); if (v) a[f] = v; }
  if (kind === 'journal' && !a.journal_name) throw new UserError('Jurnal nomini kiriting');
  if (kind === 'conf' && !a.conference_org) throw new UserError('Konferensiya nomini kiriting');

  for (const f of ['issn', 'isbn', 'udk', 'bbk']) { const v = g(f, 60); if (v) a[f] = v; }
  if (a.issn && !OK.issn.test(a.issn)) throw new UserError("ISSN formati noto'g'ri (masalan 1234-5678)");
  if (a.isbn && !OK.isbn.test(a.isbn)) throw new UserError("ISBN formati noto'g'ri (10 yoki 13 raqam)");
  const doi = g('doi', 200).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (doi) {
    if (!OK.doi.test(doi)) throw new UserError("DOI formati noto'g'ri (masalan 10.1234/abcd)");
    a.doi = doi;
  }
  const coll = g('collection', 200); if (coll) a.collection = coll;
  const refs = list(form.get('references'), /\n+/, 300, 1000).map(r => r.replace(/^(?:\[\d+\]|\d+[\.\)])\s+/, '').trim()).filter(Boolean);
  if (refs.length) a.references = refs;
  return a;
}
