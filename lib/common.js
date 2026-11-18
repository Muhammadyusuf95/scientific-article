// lib/common.js - Cloudflare Pages Functions uchun umumiy yordamchilar.
// functions/ papkasidan tashqarida turgani uchun alohida marshrut (route) bo'lmaydi,
// faqat import qilinadi: import { ... } from '../../lib/common.js'

export class UserError extends Error {}

export const PDF_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/i;
export const ID_RE = /^[a-z0-9-]{1,120}$/;

export const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });

export const clean = (v, max) =>
  String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

export const slugify = (s) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[ʻʼ‘’`'´]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '') || 'item';

export const b64decode = (b) =>
  new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export const b64encode = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(x, y);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < p.length; i++) d |= p[i] ^ q[i];
  return d === 0;
}

export async function isAdmin(request, env) {
  const given = request.headers.get('X-Admin-Token') || '';
  return !!(env.ADMIN_TOKEN && given && (await sameSecret(given, env.ADMIN_TOKEN)));
}

// ---------------- GitHub: articles.json ni o'qish va yozish ----------------
const ghBase = (env) => (env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
function ghConf(env) {
  const api = `${ghBase(env)}/repos/${env.GITHUB_REPO}/contents/articles.json`;
  const ref = env.GITHUB_BRANCH ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : '';
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'article-portal',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  return { api, ref, headers };
}

export async function readData(env) {
  const { api, ref, headers } = ghConf(env);
  const res = await fetch(api + ref, { headers });
  if (!res.ok) throw new Error(`GitHub o'qish xatosi: ${res.status}`);
  const cur = await res.json();
  let b64 = cur.content;
  if (!b64 && cur.sha) {
    const blob = await fetch(`${ghBase(env)}/repos/${env.GITHUB_REPO}/git/blobs/${cur.sha}`, { headers });
    if (!blob.ok) throw new Error(`GitHub blob xatosi: ${blob.status}`);
    b64 = (await blob.json()).content;
  }
  const data = JSON.parse(b64decode(b64));
  if (!Array.isArray(data.articles)) data.articles = [];
  if (!Array.isArray(data.collections)) data.collections = [];
  if (!data.pages || typeof data.pages !== 'object') data.pages = {};
  if (!data.site || typeof data.site !== 'object') data.site = {};
  if (!Array.isArray(data.series)) data.series = [];
  if (!Array.isArray(data.news)) data.news = [];
  if (!Array.isArray(data.profiles)) data.profiles = [];
  return { data, sha: cur.sha };
}

// mutate(data) ma'lumotni o'zgartiradi. Konflikt (409/422) bo'lsa, qayta o'qib 3 martagacha urinadi.
export async function updateData(env, message, mutate) {
  const { api, headers } = ghConf(env);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, sha } = await readData(env);
    const result = await mutate(data);
    const putRes = await fetch(api, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: b64encode(JSON.stringify(data, null, 2) + '\n'),
        sha,
        ...(env.GITHUB_BRANCH ? { branch: env.GITHUB_BRANCH } : {}),
      }),
    });
    if (putRes.ok) return { data, result };
    if (putRes.status !== 409 && putRes.status !== 422) throw new Error(`GitHub yozish xatosi: ${putRes.status}`);
  }
  throw new Error("articles.json ni yangilab bo'lmadi (konflikt)");
}

export const ghReady = (env) => !!(env.GITHUB_REPO && env.GITHUB_TOKEN);
