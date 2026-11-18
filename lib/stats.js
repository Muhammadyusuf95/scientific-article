// lib/stats.js - maqolalarning ko'rishlar va yuklab olishlar sonini hisoblash.
// Asosiy ombor: R2 (R2_OMBOR, allaqachon ulangan) -> "stats/<id>.json".
// Agar Cloudflare'da D1 bazasi STATS_DB nomi bilan ulansa, avtomatik o'shanga o'tadi
// (D1 da hisoblagich atomar oshadi, juda ko'p tashrif bo'lganda aniqroq).

const BOT_RE = /bot|crawl|spider|slurp|scholar|archiver|facebookexternalhit|embedly|preview|headless|python|curl|wget|httpclient|java\/|go-http|monitor|pingdom|lighthouse/i;

export const isBot = (request) => {
  const ua = request.headers.get('User-Agent') || '';
  return !ua || BOT_RE.test(ua);
};

let INDEX = null, INDEX_AT = 0;
// build.js yaratadigan /data/index.json: { "articles": { "<id>": { "pdf": "<fayl>.pdf" } } }
export async function loadIndex(env, request) {
  if (INDEX && Date.now() - INDEX_AT < 60000) return INDEX;
  try {
    if (!env.ASSETS) return INDEX || { articles: {} };
    const res = await env.ASSETS.fetch(new Request(new URL('/data/index.json', request.url)));
    if (res.ok) { INDEX = await res.json(); INDEX_AT = Date.now(); }
  } catch (e) { console.error('index', e); }
  return INDEX || { articles: {} };
}

const zero = () => ({ views: 0, downloads: 0 });
const key = (id) => `stats/${id}.json`;
let tableReady = false;

async function d1(env) {
  if (!tableReady) {
    await env.STATS_DB.prepare('CREATE TABLE IF NOT EXISTS stats (id TEXT PRIMARY KEY, views INTEGER NOT NULL DEFAULT 0, downloads INTEGER NOT NULL DEFAULT 0)').run();
    tableReady = true;
  }
  return env.STATS_DB;
}

export async function bump(env, id, field) {
  if (field !== 'views' && field !== 'downloads') return;
  if (env.STATS_DB) {
    const db = await d1(env);
    await db.prepare(`INSERT INTO stats (id, ${field}) VALUES (?1, 1) ON CONFLICT(id) DO UPDATE SET ${field} = ${field} + 1`).bind(id).run();
    return;
  }
  if (!env.R2_OMBOR) return;
  const o = await env.R2_OMBOR.get(key(id));
  const s = o ? { ...zero(), ...(await o.json()) } : zero();
  s[field] = (Number(s[field]) || 0) + 1;
  s.updated = new Date().toISOString();
  await env.R2_OMBOR.put(key(id), JSON.stringify(s), { httpMetadata: { contentType: 'application/json' } });
}

export async function getOne(env, id) {
  if (env.STATS_DB) {
    const db = await d1(env);
    const r = await db.prepare('SELECT views, downloads FROM stats WHERE id = ?1').bind(id).first();
    return r ? { views: r.views, downloads: r.downloads } : zero();
  }
  if (!env.R2_OMBOR) return zero();
  const o = await env.R2_OMBOR.get(key(id));
  if (!o) return zero();
  const s = await o.json();
  return { views: Number(s.views) || 0, downloads: Number(s.downloads) || 0 };
}

export async function getAll(env) {
  const out = {};
  if (env.STATS_DB) {
    const db = await d1(env);
    const { results } = await db.prepare('SELECT id, views, downloads FROM stats').all();
    for (const r of results || []) out[r.id] = { views: r.views, downloads: r.downloads };
    return out;
  }
  if (!env.R2_OMBOR) return out;
  let cursor;
  const keys = [];
  do {
    const page = await env.R2_OMBOR.list({ prefix: 'stats/', cursor, limit: 1000 });
    for (const o of page.objects) keys.push(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  await Promise.all(keys.map(async (k) => {
    const o = await env.R2_OMBOR.get(k);
    if (!o) return;
    const s = await o.json();
    out[k.slice(6, -5)] = { views: Number(s.views) || 0, downloads: Number(s.downloads) || 0 };
  }));
  return out;
}
