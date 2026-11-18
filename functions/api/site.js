// functions/api/site.js -> POST /api/site
// Sayt nomi/tavsifi va ma'lumot sahifalarini (Portal haqida, Tahririyat hay'ati, Nashr etikasi, Aloqa ...) tahrirlash.
//   { site: { name, description, publisher, email, author_groups }, pages: { "<kalit>": { title, text: "paragraf\n\nparagraf" } } }
import { json, clean, UserError, isAdmin, updateData, ghReady } from '../../lib/common.js';

const RESERVED = new Set(['article', 'collection', 'collections', 'author', 'authors', 'pdf', 'api', 'stats', 'data', 'css', 'js', 'admin', 'year',
  'journal', 'journals', 'conference', 'conferences', 'news', 'archive', 'search', 'feed', 'oai']);
const KEY_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

// Muallif ismlarini birlashtirish: [{ name, variants: [..], show_variants: bool }]
function cleanGroups(raw) {
  if (!Array.isArray(raw)) throw new UserError("Muallif ismlari ro'yxati noto'g'ri");
  const fold = (x) => x.toLowerCase().replace(/[ʻʼ‘’`´']/g, '').replace(/\s+/g, ' ').trim();
  const used = new Set(), out = [];
  for (const g of raw.slice(0, 100)) {
    const name = clean(g && g.name, 200);
    const variants = [...new Set([].concat((g && g.variants) || []).map((v) => clean(v, 200)).filter(Boolean))].slice(0, 20);
    if (!name && !variants.length) continue;
    if (!name) throw new UserError("Muallif ismlari: asosiy ism bo'sh qolgan guruh bor");
    const vs = variants.filter((v) => fold(v) !== fold(name));
    if (!vs.length) throw new UserError(`"${name}" uchun kamida bitta boshqa yozilish kiriting`);
    for (const x of [name, ...vs]) {
      if (used.has(fold(x))) throw new UserError(`"${x}" bir nechta guruhda takrorlangan`);
      used.add(fold(x));
    }
    out.push({ name, variants: vs, show_variants: g.show_variants === true });
  }
  return out;
}

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
      if (site && site.author_groups !== undefined) {
        const groups = cleanGroups(site.author_groups);
        if (groups.length) data.site.author_groups = groups; else delete data.site.author_groups;
      }
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
