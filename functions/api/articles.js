// functions/api/articles.js  ->  GET /api/articles  (faqat admin: tahrirlash uchun to'liq ro'yxat)
import { json, assertAdmin, readArticles } from '../_lib/common.js';

export async function onRequestGet({ request, env }) {
  try {
    const denied = await assertAdmin(request, env);
    if (denied) return denied;
    if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    const { data } = await readArticles(env);
    return json({ success: true, articles: data.articles });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
