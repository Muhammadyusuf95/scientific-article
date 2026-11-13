// functions/api/delete.js  ->  POST /api/delete  (id va confirm=id maydonlari)
// Nashr articles.json dan olib tashlanadi, PDF R2 da deleted/ papkasiga ko'chiriladi (qayta tiklash mumkin).
import { ID_RE, UserError, json, clean, assertAdmin, updateArticles, archiveObject } from '../_lib/common.js';

export async function onRequestPost({ request, env }) {
  try {
    const denied = await assertAdmin(request, env);
    if (denied) return denied;
    if (!env.R2_OMBOR || !env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    }
    const form = await request.formData();
    const id = clean(form.get('id'), 120);
    if (!ID_RE.test(id)) throw new UserError("Nashr ID si noto'g'ri");
    if (clean(form.get('confirm'), 120) !== id) throw new UserError('Tasdiqlash mos kelmadi');

    let key = null;
    await updateArticles(env, (data) => {
      const i = data.articles.findIndex((a) => a.id === id);
      if (i < 0) throw new UserError('Nashr topilmadi');
      key = data.articles[i].pdf || null;
      data.articles.splice(i, 1);
    }, `Nashr o'chirildi: ${id}`);

    if (key) { try { await archiveObject(env, key); } catch (e) { console.error(e); } }
    return json({ success: true });
  } catch (err) {
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
