// POST /api/collection (JSON): { op: 'update', id, name, year, volume, issue, ... }  yoki  { op: 'delete', id }
// To'plamni faqat ichida maqola qolmagan bo'lsa o'chirish mumkin.
import { admin, json, UserError, mutate, clean, OK } from '../_lib/common.js';

const FIELDS = { journal: [['volume', 60], ['issue', 60]], conf: [['conference_place', 200], ['conference_date', 200]] };
const COMMON = [['publisher', 200], ['publisher_city', 200], ['issn', 60], ['isbn', 60]];

export const onRequestPost = admin(async ({ request, env }) => {
  let b; try { b = await request.json(); } catch (_) { throw new UserError("Noto'g'ri so'rov"); }
  const id = String(b.id || '').slice(0, 200);
  if (b.op === 'delete') {
    await mutate(env, `To'plam o'chirildi: ${id}`, (data) => {
      const i = data.collections.findIndex((c) => c.id === id);
      if (i < 0) throw new UserError("To'plam topilmadi", 404);
      const n = data.articles.filter((a) => a.collection === id).length;
      if (n) throw new UserError(`To'plamda ${n} ta maqola bor. Avval ularni boshqa to'plamga o'tkazing yoki o'chiring`);
      data.collections.splice(i, 1);
    });
    return json({ success: true });
  }
  if (b.op !== 'update') throw new UserError("Noto'g'ri amal");
  await mutate(env, `To'plam yangilandi: ${id}`, (data) => {
    const c = data.collections.find((x) => x.id === id);
    if (!c) throw new UserError("To'plam topilmadi", 404);
    const name = clean(b.name, 200); if (!name) throw new UserError('Nomini kiriting');
    c.name = name; if (c.type === 'journal') c.journal_name = name; else c.conference_org = name;
    const y = clean(b.year, 4); if (/^\d{4}$/.test(y)) c.year = Number(y); else delete c.year;
    for (const [k, m] of [...FIELDS[c.type], ...COMMON]) { const v = clean(b[k], m); if (v) c[k] = v; else delete c[k]; }
    if (c.issn && !OK.issn.test(c.issn)) throw new UserError("ISSN formati noto'g'ri (masalan 1234-5678)");
    if (c.isbn && !OK.isbn.test(c.isbn)) throw new UserError("ISBN formati noto'g'ri (10 yoki 13 raqam)");
  });
  return json({ success: true });
});
