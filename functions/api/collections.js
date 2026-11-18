// functions/api/collections.js -> POST /api/collections
// To'plamlarni yaratish, tahrirlash va o'chirish (admin kaliti /api/_middleware.js da tekshiriladi).
//   { action: "save",   id?, name, type, year?, place?, publisher?, issn?, isbn?, description? }
//   { action: "delete", id, confirm }   -> to'plam o'chadi, ichidagi maqolalar saytda qoladi
import { json, clean, slugify, UserError, ID_RE, isAdmin, updateData, ghReady } from '../../lib/common.js';

const TYPES = ['conf', 'journal'];
const OPTIONAL = { year: 4, place: 200, publisher: 200, issn: 20, isbn: 30, description: 3000, editor: 300, date: 60 };

export async function onRequestPost({ request, env }) {
  try {
    if (!ghReady(env)) return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);

    let body;
    try { body = await request.json(); } catch (_) { throw new UserError("So'rov noto'g'ri"); }
    const action = clean(body.action, 20);
    const id = clean(body.id, 120);
    if (id && !ID_RE.test(id)) throw new UserError("To'plam ID si noto'g'ri");

    if (action === 'delete') {
      if (!id) throw new UserError("To'plam tanlanmagan");
      if (clean(body.confirm, 120) !== id) throw new UserError('Tasdiqlash mos kelmadi');
      const { result } = await updateData(env, `To'plam o'chirildi: ${id}`, (data) => {
        const i = data.collections.findIndex((c) => c.id === id);
        if (i < 0) throw new UserError("To'plam topilmadi");
        data.collections.splice(i, 1);
        let detached = 0;
        for (const a of data.articles) if (a.collection === id) { delete a.collection; detached++; }
        return { detached };
      });
      return json({ success: true, detached: result.detached });
    }

    if (action === 'assign') {
      // To'plam tarkibini belgilash: ro'yxatdagi maqolalar shu to'plamga kiradi, qolganlari chiqariladi
      if (!id) throw new UserError("To'plam tanlanmagan");
      const ids = Array.isArray(body.articles) ? body.articles.map((x) => clean(x, 120)).filter((x) => ID_RE.test(x)) : [];
      const { result } = await updateData(env, `To'plam tarkibi yangilandi: ${id}`, (data) => {
        if (!data.collections.some((c) => c.id === id)) throw new UserError("To'plam topilmadi");
        let n = 0;
        for (const a of data.articles) {
          if (ids.includes(a.id)) { a.collection = id; n++; }
          else if (a.collection === id) delete a.collection;
        }
        return { count: n };
      });
      return json({ success: true, count: result.count });
    }

    if (action !== 'save') throw new UserError("Noma'lum amal");
    const name = clean(body.name, 200).replace(/\s+/g, ' ');
    if (!name) throw new UserError("To'plam nomini kiriting");
    const type = TYPES.includes(body.type) ? body.type : 'conf';
    const fields = { name, type };
    for (const [f, max] of Object.entries(OPTIONAL)) fields[f] = clean(body[f], max);
    if (fields.year && !/^\d{4}$/.test(fields.year)) throw new UserError("Yil 4 xonali son bo'lishi kerak");
    if (fields.issn && !/^\d{4}-\d{3}[\dXx]$/.test(fields.issn)) throw new UserError("ISSN formati noto'g'ri (masalan 1234-5678)");

    const { result } = await updateData(env, id ? `To'plam tahrirlandi: ${id}` : `Yangi to'plam: ${name}`, (data) => {
      if (id) {
        const i = data.collections.findIndex((c) => c.id === id);
        if (i < 0) throw new UserError("To'plam topilmadi");
        const merged = { ...data.collections[i], ...fields, id };
        for (const f of Object.keys(OPTIONAL)) if (!merged[f]) delete merged[f];
        data.collections[i] = merged;
        return { id };
      }
      // Yangi to'plam: ID nomdan olinadi va o'zgarmaydi (sahifa manzili doimiy bo'lishi uchun)
      let nid = slugify(name + (fields.year && !name.includes(fields.year) ? ' ' + fields.year : ''));
      if (data.collections.some((c) => c.id === nid)) nid = `${nid}-${crypto.randomUUID().slice(0, 4)}`;
      const obj = { id: nid, ...fields };
      for (const f of Object.keys(OPTIONAL)) if (!obj[f]) delete obj[f];
      data.collections.push(obj);
      return { id: nid };
    });
    return json({ success: true, id: result.id });
  } catch (err) {
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
