// POST /api/delete  (JSON yoki forma): { id, confirm }  -> confirm id bilan bir xil bo'lishi shart.
// Nashr articles.json dan olib tashlanadi, PDF esa R2 da deleted/ papkasiga ko'chiriladi (qayta tiklash mumkin).
import { admin, json, UserError, ID_RE, clean, mutate, archiveObject } from '../_lib/common.js';

export const onRequestPost = admin(async ({ request, env }) => {
  let b = {};
  const type = request.headers.get('Content-Type') || '';
  try {
    if (type.includes('application/json')) b = await request.json();
    else { const f = await request.formData(); b = { id: f.get('id'), confirm: f.get('confirm') }; }
  } catch (_) { throw new UserError("Noto'g'ri so'rov"); }

  const id = clean(b.id, 120);
  if (!ID_RE.test(id)) throw new UserError("Nashr ID si noto'g'ri");
  if (clean(b.confirm, 120) !== id) throw new UserError('Tasdiqlash mos kelmadi');

  // 1) Avval ma'lumotlar bazasidan olib tashlanadi (sayt shu fayl asosida quriladi)
  const pdf = await mutate(env, `Nashr o'chirildi: ${id}`, (data) => {
    const i = data.articles.findIndex((a) => a.id === id);
    if (i < 0) throw new UserError('Nashr topilmadi', 404);
    return data.articles.splice(i, 1)[0].pdf || null;
  });

  // 2) Keyin PDF arxivlanadi. Bu bosqich muvaffaqiyatsiz bo'lsa ham nashr allaqachon o'chgan: PDF R2 da qoladi, hech narsa yo'qolmaydi.
  let archived = true;
  if (pdf) { try { archived = await archiveObject(env, pdf); } catch (e) { archived = false; console.error('Arxivlash xatosi', e); } }
  return json({ success: true, archived });
});
