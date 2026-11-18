// functions/api/news.js -> POST /api/news
// E'lonlar (konferensiyaga maqola qabul qilish, yangi son chiqqani va boshqa yangiliklar).
//   { action: "save", id?, kind: "cfp"|"news", title, date?, deadline?, event_date?, place?, series?, collection?, text, link?, link_text? }
//   { action: "delete", id, confirm }
import { json, clean, slugify, UserError, ID_RE, isAdmin, updateData, ghReady } from '../../lib/common.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestPost({ request, env }) {
  try {
    if (!ghReady(env)) return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    let body;
    try { body = await request.json(); } catch (_) { throw new UserError("So'rov noto'g'ri"); }
    const action = clean(body.action, 20), id = clean(body.id, 120);
    if (id && !ID_RE.test(id)) throw new UserError("ID noto'g'ri");

    if (action === 'delete') {
      if (!id || clean(body.confirm, 120) !== id) throw new UserError('Tasdiqlash mos kelmadi');
      await updateData(env, `E'lon o'chirildi: ${id}`, (data) => {
        const i = data.news.findIndex((x) => x.id === id);
        if (i < 0) throw new UserError("E'lon topilmadi");
        data.news.splice(i, 1);
      });
      return json({ success: true });
    }
    if (action !== 'save') throw new UserError("Noma'lum amal");

    const title = clean(body.title, 300).replace(/\s+/g, ' ');
    if (!title) throw new UserError("E'lon sarlavhasini kiriting");
    const text = String(clean(body.text, 30000)).split(/\n\s*\n/).map((p) => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).slice(0, 60);
    if (!text.length) throw new UserError("E'lon matnini kiriting");
    const obj = { kind: body.kind === 'cfp' ? 'cfp' : 'news', title, date: clean(body.date, 10) || new Date().toISOString().slice(0, 10), text };
    if (!DAY.test(obj.date)) throw new UserError("E'lon sanasi noto'g'ri");
    const deadline = clean(body.deadline, 10);
    if (deadline) { if (!DAY.test(deadline)) throw new UserError("Qabul muddati noto'g'ri"); obj.deadline = deadline; }
    for (const [k, max] of [['event_date', 80], ['place', 200], ['link_text', 60], ['series', 120], ['collection', 120]]) { const v = clean(body[k], max); if (v) obj[k] = v; }
    const link = clean(body.link, 500);
    if (link) { if (!/^https?:\/\/\S+$/i.test(link)) throw new UserError('Havola http(s):// bilan boshlanishi kerak'); obj.link = link; }

    const { result } = await updateData(env, id ? `E'lon tahrirlandi: ${id}` : `Yangi e'lon: ${title}`, (data) => {
      if (obj.series && !data.series.some((s) => s.id === obj.series)) throw new UserError('Tanlangan jurnal yoki konferensiya topilmadi');
      if (obj.collection && !data.collections.some((c) => c.id === obj.collection)) throw new UserError("Tanlangan son yoki to'plam topilmadi");
      if (id) {
        const i = data.news.findIndex((x) => x.id === id);
        if (i < 0) throw new UserError("E'lon topilmadi");
        data.news[i] = { id, ...obj };
        return { id };
      }
      let nid = slugify(title);
      if (data.news.some((x) => x.id === nid)) nid = `${nid}-${crypto.randomUUID().slice(0, 4)}`;
      data.news.unshift({ id: nid, ...obj });
      return { id: nid };
    });
    return json({ success: true, id: result.id });
  } catch (err) {
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
