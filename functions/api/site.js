// functions/api/site.js -> POST /api/site
// Sayt nomi/tavsifi va ma'lumot sahifalarini (Portal haqida, Tahririyat hay'ati, Nashr etikasi, Aloqa ...) tahrirlash.
//   { site: { name, description, publisher, email }, pages: { "<kalit>": { title, text: "paragraf\n\nparagraf" } } }
import { json, clean, UserError, isAdmin, updateData, ghReady } from '../../lib/common.js';

const RESERVED = new Set(['article', 'collection', 'author', 'pdf', 'api', 'stats', 'data', 'css', 'js', 'admin', 'year']);
const KEY_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export async function onRequestPost({ request, env }) {
  try {
    if (!ghReady(env)) return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    let body;
    try { body = await request.json(); } catch (_) { throw new UserError("So'rov noto'g'ri"); }

    const site = body.site && typeof body.site === 'object' ? body.site : null;
    const pages = body.pages && typeof body.pages === 'object' ? body.pages : null;
    const remove = Array.isArray(body.remove) ? body.remove.map((k) => clean(k, 40)) : [];

    const cleanPages = {};
    if (pages) {
      for (const [k, v] of Object.entries(pages)) {
        if (!KEY_RE.test(k) || RESERVED.has(k)) throw new UserError(`Sahifa manzili noto'g'ri: ${k}`);
        const title = clean(v && v.title, 120);
        if (!title) throw new UserError(`"${k}" sahifasining sarlavhasi bo'sh`);
        const raw = Array.isArray(v.text) ? v.text.join('\n\n') : clean(v.text, 20000);
        const text = String(raw).split(/\n\s*\n/).map((p) => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).slice(0, 80);
        if (!text.length) throw new UserError(`"${title}" sahifasi matni bo'sh`);
        cleanPages[k] = { title, text };
      }
    }

    await updateData(env, 'Sayt sahifalari yangilandi', (data) => {
      if (site) {
        for (const [f, max] of [['name', 120], ['description', 400], ['publisher', 200], ['email', 120]]) {
          if (site[f] !== undefined) {
            const v = clean(site[f], max);
            if (f === 'name' && !v) throw new UserError("Sayt nomi bo'sh bo'lmasligi kerak");
            if (v) data.site[f] = v; else delete data.site[f];
          }
        }
      }
      for (const [k, v] of Object.entries(cleanPages)) data.pages[k] = { ...(data.pages[k] || {}), ...v };
      for (const k of remove) if (data.pages[k] && !['about', 'contact'].includes(k)) delete data.pages[k];
    });
    return json({ success: true });
  } catch (err) {
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
