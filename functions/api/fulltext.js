// functions/api/fulltext.js -> /api/fulltext (admin)
//   GET                       -> { ids: [...] } to'liq matni saqlangan maqolalar
//   POST { id, blocks }       -> matnni R2 ga yozadi: text/<id>.json
//   POST { id, action: "delete" }
// Matn maqola sahifasiga functions/article/_middleware.js orqali server tomonida qo'yiladi.
// Bu articles.json ni o'zgartirmaydi: saytni qayta yig'ish (build) shart emas.
import { json, clean, UserError, ID_RE, isAdmin, readData } from '../../lib/common.js';

const MAX_BLOCKS = 6000, MAX_BLOCK = 20000, MAX_TOTAL = 400000;

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
  if (!env.R2_OMBOR) return json({ success: false, error: "R2 ulanmagan" }, 500);
  const ids = [];
  let cursor;
  do {
    const page = await env.R2_OMBOR.list({ prefix: 'text/', cursor, limit: 1000 });
    for (const o of page.objects) ids.push(o.key.slice(5, -5));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({ success: true, ids });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    if (!env.R2_OMBOR) return json({ success: false, error: 'R2 ulanmagan' }, 500);
    let body;
    try { body = await request.json(); } catch (_) { throw new UserError("So'rov noto'g'ri"); }
    const id = clean(body.id, 120);
    if (!ID_RE.test(id)) throw new UserError("ID noto'g'ri");
    const key = `text/${id}.json`;
    if (body.action === 'delete') { await env.R2_OMBOR.delete(key); return json({ success: true }); }

    const { data } = await readData(env);
    if (!data.articles.some((a) => a.id === id)) throw new UserError('Maqola topilmadi');
    if (!Array.isArray(body.blocks) || !body.blocks.length) throw new UserError("Matn bo'sh");
    let total = 0;
    const blocks = [];
    for (const b of body.blocks.slice(0, MAX_BLOCKS)) {
      const x = clean(b && b.x, MAX_BLOCK).replace(/\s+/g, ' ');
      if (!x) continue;
      if (total + x.length > MAX_TOTAL) break;
      total += x.length;
      blocks.push({ t: b.t === 'h' ? 'h' : 'p', x });
    }
    if (total < 300) throw new UserError("PDF dan matn deyarli olinmadi (skan qilingan bo'lishi mumkin)");
    await env.R2_OMBOR.put(key, JSON.stringify({ v: 1, updated: new Date().toISOString(), chars: total, blocks }), { httpMetadata: { contentType: 'application/json' } });
    return json({ success: true, chars: total, blocks: blocks.length });
  } catch (err) {
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
