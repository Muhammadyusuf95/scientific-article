// functions/api/profiles.js -> POST /api/profiles
// Muallif profillari (muallif sahifasida chiqadi): ilmiy daraja, lavozim, ish joyi, qisqacha ma'lumot,
// ilmiy qiziqishlar, ORCID, Google Scholar, ResearchGate va shaxsiy sayt havolalari.
//   { action: "save", name, degree?, position?, org?, bio?, interests?, orcid?, scholar?, researchgate?, website? }
//   { action: "delete", name }
// Profil muallifga ismi bo'yicha bog'lanadi (familiya va ism; o'g'li/qizi va yozilish farqlari hisobga olinmaydi).
import { json, clean, UserError, isAdmin, updateData, ghReady } from '../../lib/common.js';

const ORCID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const URLS = {
  scholar: /^https:\/\/scholar\.google\.[a-z.]+\/citations\?\S+$/i,
  researchgate: /^https:\/\/(www\.)?researchgate\.net\/profile\/\S+$/i,
  website: /^https?:\/\/\S+$/i,
};
const fold = (s) => String(s || '').toLowerCase().replace(/[ʻʼ‘’`´']/g, '').replace(/\s+/g, ' ').trim();

export async function onRequestPost({ request, env }) {
  try {
    if (!ghReady(env)) return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    if (!(await isAdmin(request, env))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    let body;
    try { body = await request.json(); } catch (_) { throw new UserError("So'rov noto'g'ri"); }
    const name = clean(body.name, 200).replace(/\s+/g, ' ');
    if (!name) throw new UserError('Muallif ismini kiriting');

    if (body.action === 'delete') {
      await updateData(env, `Muallif profili o'chirildi: ${name}`, (data) => {
        const i = data.profiles.findIndex((p) => fold(p.name) === fold(name));
        if (i < 0) throw new UserError('Profil topilmadi');
        data.profiles.splice(i, 1);
      });
      return json({ success: true });
    }
    if (body.action !== 'save') throw new UserError("Noma'lum amal");

    const p = { name };
    for (const [k, max] of [['degree', 200], ['position', 200], ['org', 300]]) { const v = clean(body[k], max); if (v) p[k] = v; }
    const bio = String(clean(body.bio, 8000)).split(/\n\s*\n/).map((x) => x.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).slice(0, 12);
    if (bio.length) p.bio = bio;
    const interests = [...new Set(clean(body.interests, 2000).split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 20).map((x) => x.slice(0, 80));
    if (interests.length) p.interests = interests;
    const orcid = clean(body.orcid, 60).replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
    if (orcid) { if (!ORCID.test(orcid)) throw new UserError("ORCID noto'g'ri (namuna: 0000-0002-1825-0097)"); p.orcid = orcid; }
    for (const [k, re] of Object.entries(URLS)) {
      const v = clean(body[k], 400);
      if (!v) continue;
      if (!re.test(v)) throw new UserError({ scholar: 'Google Scholar havolasi https://scholar.google.com/citations?user=... shaklida bo\'lishi kerak', researchgate: 'ResearchGate havolasi https://www.researchgate.net/profile/... shaklida bo\'lishi kerak', website: 'Sayt havolasi http(s):// bilan boshlanishi kerak' }[k]);
      p[k] = v;
    }

    await updateData(env, `Muallif profili: ${name}`, (data) => {
      const i = data.profiles.findIndex((x) => fold(x.name) === fold(name) || (body.old_name && fold(x.name) === fold(body.old_name)));
      if (i >= 0) data.profiles[i] = p; else data.profiles.push(p);
    });
    return json({ success: true });
  } catch (err) {
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
