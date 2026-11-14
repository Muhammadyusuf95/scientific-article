// GET /api/list           -> { articles: [qisqa ro'yxat], collections: [... + count] }
// GET /api/list?id=<id>   -> { article, collection } (to'liq ma'lumot, tahrirlash uchun)
import { admin, json, UserError, readData, LANGS } from '../_lib/common.js';

export const onRequestGet = admin(async ({ request, env }) => {
  const { data } = await readData(env);
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const article = data.articles.find((a) => a.id === id);
    if (!article) throw new UserError('Maqola topilmadi', 404);
    return json({ success: true, article, collection: data.collections.find((c) => c.id === article.collection) || null });
  }
  const count = {}; for (const a of data.articles) if (a.collection) count[a.collection] = (count[a.collection] || 0) + 1;
  const main = (a) => a['title_' + a.language] || LANGS.map((l) => a['title_' + l]).find(Boolean) || a.id;
  return json({
    success: true,
    articles: data.articles.map((a) => ({ id: a.id, title: main(a), authors: a.authors, year: a.year, item_type: a.item_type, collection: a.collection || '', pdf_size: a.pdf_size || 0 })),
    collections: data.collections.map((c) => ({ ...c, count: count[c.id] || 0 })),
  });
});
