// functions/api/collections.js  ->  GET /api/collections
// Admin panel uchun: saytdagi barcha to'plamlar ro'yxati (har birida nechta nashr borligi bilan).
import { admin, json, readData } from '../_lib/common.js';

export const onRequestGet = admin(async ({ env }) => {
  const { data } = await readData(env);
  const count = {};
  for (const a of data.articles) if (a.collection) count[a.collection] = (count[a.collection] || 0) + 1;
  const collections = data.collections.map((c) => ({ ...c, count: count[c.id] || 0 }));
  return json({ success: true, collections });
});
