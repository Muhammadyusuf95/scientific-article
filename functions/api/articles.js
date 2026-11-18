// functions/api/articles.js -> GET /api/articles
// Admin panel uchun: maqolalar, to'plamlar, sayt sozlamalari va sahifalar.
import { json, isAdmin, readData, ghReady } from '../../lib/common.js';

export async function onRequestGet({ request, env }) {
  try {
    if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    if (!ghReady(env)) return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    const { data } = await readData(env);
    return json({
      success: true,
      articles: data.articles,
      collections: data.collections,
      site: data.site,
      pages: data.pages,
    });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
