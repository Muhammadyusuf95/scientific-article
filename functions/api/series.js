// functions/api/series.js -> POST /api/series
// Jurnal va konferensiyalar (nashr seriyalari): yaratish, tahrirlash, o'chirish.
//   { action: "save", id?, type: "journal"|"conf", name, short?, description?, issn?, eissn?, founded?, frequency?, languages?, scope?,
//     publisher?, email?, address?, editors: [{ name, role, org, degree, orcid }], indexing: [{ name, url }], guidelines?, ethics? }
//   { action: "delete", id, confirm }  -> seriya o'chadi, uning sonlari va maqolalari saytda qoladi
import { json, clean, slugify, UserError, ID_RE, isAdmin, updateData, ghReady } from '../../lib/common.js';

const ISSN = /^\d{4}-\d{3}[\dXx]$/;
const ORCID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const TEXT = { short: 20, issn: 9, eissn: 9, founded: 4, frequency: 80, languages: 120, scope: 300, publisher: 200, email: 120, address: 300, field: 120 };
const paras = (v) => String(Array.isArray(v) ? v.join('\n\n') : clean(v, 30000)).split(/\n\s*\n/).map((p) => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).slice(0, 60);

function editors(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 80).map((m) => {
    const orcid = clean(m && m.orcid, 60).replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
    const e = { name: clean(m && m.name, 160), role: clean(m && m.role, 100), org: clean(m && m.org, 200), degree: clean(m && m.degree, 200), orcid };
    if (!e.name) return null;
    if (e.orcid && !ORCID.test(e.orcid)) throw new UserError(`"${e.name}": ORCID noto'g'ri (namuna: 0000-0002-1825-0097)`);
    for (const k of Object.keys(e)) if (!e[k]) delete e[k];
    return e;
  }).filter(Boolean);
}
function indexing(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 40).map((x) => {
    const name = clean(x && x.name, 120), url = clean(x && x.url, 400);
    if (!name) return null;
    if (url && !/^https?:\/\/\S+$/i.test(url)) throw new UserError(`"${name}" havolasi http(s):// bilan boshlanishi kerak`);
    return url ? { name, url } : { name };
  }).filter(Boolean);
}

export async function onRequestPost({ request, env }) {
  try {
    if (!ghReady(env)) return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    let body;
    try { body = await request.json(); } catch (_) { throw new UserError("So'rov noto'g'ri"); }
    const action = clean(body.action, 20), id = clean(body.id, 120);
    if (id && !ID_RE.test(id)) throw new UserError('ID noto\'g\'ri');

    if (action === 'delete') {
      if (!id) throw new UserError('Tanlanmagan');
      if (clean(body.confirm, 120) !== id) throw new UserError('Tasdiqlash mos kelmadi');
      const { result } = await updateData(env, `Seriya o'chirildi: ${id}`, (data) => {
        const i = data.series.findIndex((s) => s.id === id);
        if (i < 0) throw new UserError('Topilmadi');
        data.series.splice(i, 1);
        let n = 0;
        for (const c of data.collections) if (c.series === id) { delete c.series; n++; }
        for (const x of data.news) if (x.series === id) delete x.series;
        return { detached: n };
      });
      return json({ success: true, detached: result.detached });
    }
    if (action !== 'save') throw new UserError("Noma'lum amal");

    const name = clean(body.name, 250).replace(/\s+/g, ' ');
    if (!name) throw new UserError('Nomini kiriting');
    const obj = { type: body.type === 'journal' ? 'journal' : 'conf', name };
    for (const [k, max] of Object.entries(TEXT)) { const v = clean(body[k], max); if (v) obj[k] = v; }
    for (const k of ['issn', 'eissn']) if (obj[k] && !ISSN.test(obj[k])) throw new UserError(`${k.toUpperCase()} formati noto'g'ri (masalan 1234-5678)`);
    if (obj.founded && !/^\d{4}$/.test(obj.founded)) throw new UserError("Tashkil etilgan yil 4 xonali bo'lishi kerak");
    if (obj.short && !/^[\p{L}\d.-]{1,20}$/u.test(obj.short)) throw new UserError("Qisqa nom faqat harf, raqam, nuqta va chiziqchadan iborat bo'lsin (masalan FM)");
    for (const k of ['description', 'guidelines', 'ethics']) { const v = paras(body[k]); if (v.length) obj[k] = v; }
    const ed = editors(body.editors), ix = indexing(body.indexing);
    if (ed.length) obj.editors = ed;
    if (ix.length) obj.indexing = ix;

    const { result } = await updateData(env, id ? `Seriya tahrirlandi: ${id}` : `Yangi seriya: ${name}`, (data) => {
      if (id) {
        const i = data.series.findIndex((s) => s.id === id);
        if (i < 0) throw new UserError('Topilmadi');
        data.series[i] = { id, ...obj };
        // seriya turi o'zgarsa, uning sonlari ham shu turga o'tadi
        for (const c of data.collections) if (c.series === id) c.type = obj.type;
        return { id };
      }
      let nid = slugify(name); // manzil to'liq nomdan: o'qilishi oson va doimiy
      if (data.series.some((s) => s.id === nid)) nid = `${nid}-${crypto.randomUUID().slice(0, 4)}`;
      data.series.push({ id: nid, ...obj });
      return { id: nid };
    });
    return json({ success: true, id: result.id });
  } catch (err) {
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
