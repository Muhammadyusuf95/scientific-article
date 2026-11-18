// functions/stats.js
//   GET  /stats?id=<id>  -> { views, downloads } (ochiq, maqola sahifasi uchun)
//   GET  /stats          -> barcha maqolalar statistikasi (faqat admin kaliti bilan)
//   POST /stats {id}     -> ko'rishlar sonini 1 ga oshiradi (maqola sahifasi ochilganda)
import { json, isAdmin, ID_RE } from '../lib/common.js';
import { bump, getOne, getAll, loadIndex, isBot } from '../lib/stats.js';

export async function onRequestGet({ request, env }) {
  try {
    const id = new URL(request.url).searchParams.get('id') || '';
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
