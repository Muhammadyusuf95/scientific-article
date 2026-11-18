// functions/stats.js
//   GET  /stats?id=<id>  -> { views, downloads } (ochiq, maqola sahifasi uchun)
//   GET  /stats          -> barcha maqolalar statistikasi (faqat admin kaliti bilan)
//   POST /stats {id}     -> ko'rishlar sonini 1 ga oshiradi (maqola sahifasi ochilganda)
import { json, isAdmin, ID_RE } from '../lib/common.js';
import { bump, getOne, getAll, loadIndex, isBot } from '../lib/stats.js';

// Ochiq: GET /stats?ids=a,b,c (muallif sahifasidagi jami ko'rsatkich, 200 tagacha)
//        GET /stats?top=10 (eng ko'p o'qilgan maqolalar, 30 daqiqa keshlanadi)
async function topList(env, request, n) {
  const cache = caches.default, ck = new Request(new URL('/stats?top=all', request.url).toString());
  let all = null;
  const hit = await cache.match(ck);
  if (hit) all = await hit.json();
  else {
    const st = await getAll(env);
    all = Object.entries(st).map(([id, s]) => ({ id, views: s.views, downloads: s.downloads }))
      .filter((x) => x.views + x.downloads > 0).sort((a, b) => (b.downloads * 3 + b.views) - (a.downloads * 3 + a.views)).slice(0, 50);
    await cache.put(ck, new Response(JSON.stringify(all), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' } }));
  }
  return all.slice(0, n);
}

export async function onRequestGet({ request, env }) {
  try {
    const sp = new URL(request.url).searchParams;
    if (sp.get('top')) {
      const n = Math.min(20, Math.max(1, parseInt(sp.get('top'), 10) || 10));
      return json({ success: true, items: await topList(env, request, n) }, 200, { 'Cache-Control': 'public, max-age=600' });
    }
    if (sp.get('ids')) {
      const ids = [...new Set(sp.get('ids').split(',').map((x) => x.trim()).filter((x) => ID_RE.test(x)))].slice(0, 200);
      const items = {};
      const total = { views: 0, downloads: 0 };
      await Promise.all(ids.map(async (x) => { const s = await getOne(env, x); items[x] = s; total.views += s.views; total.downloads += s.downloads; }));
      return json({ success: true, total, items }, 200, { 'Cache-Control': 'public, max-age=300' });
    }
    const id = sp.get('id') || '';
    if (id) {
      if (!ID_RE.test(id)) return json({ success: false, error: 'ID noto\'g\'ri' }, 400);
      return json({ success: true, id, ...(await getOne(env, id)) }, 200, { 'Cache-Control': 'no-store' });
    }
    if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    return json({ success: true, stats: await getAll(env) });
  } catch (e) {
    console.error(e);
    return json({ success: false, error: 'Statistika vaqtincha mavjud emas' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ success: false }, 403);
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ success: false }, 403);
    if (Number(request.headers.get('Content-Length') || 0) > 2000) return json({ success: false }, 413);

    let id = '';
    try { id = String((await request.json()).id || ''); } catch (_) {}
    if (!ID_RE.test(id)) return json({ success: false, error: "ID noto'g'ri" }, 400);

    const index = await loadIndex(env, request);
    if (index.articles && Object.keys(index.articles).length && !index.articles[id]) {
      return json({ success: false, error: 'Maqola topilmadi' }, 404);
    }
    if (!isBot(request)) await bump(env, id, 'views');
    return json({ success: true, ...(await getOne(env, id)) });
  } catch (e) {
    console.error(e);
    return json({ success: false }, 500);
  }
}
