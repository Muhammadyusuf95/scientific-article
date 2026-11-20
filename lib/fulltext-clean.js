// lib/fulltext-clean.js - maqola sahifasidagi "Maqola matni" bo'limini tozalaydi (functions/article/_middleware.js ishlatadi).
// R2 dagi matn (text/<id>.json) o'zgarmaydi, faqat sahifaga chiqarishda:
//  * faqat raqamdan iborat qatorlar (bet raqami, snoska raqami) tashlanadi;
//  * maqolaning o'zida "Foydalanilgan adabiyotlar" bo'limi alohida chiqsa (hasRefs), matn ichidagi nusxasi olib tashlanadi,
//    chunki bir xil ro'yxat sahifada ikki marta chiqishi qidiruv tizimlari uchun takroriy kontent hisoblanadi.

const NUM_ONLY = /^[\s\-–—~]*\d{1,4}[\s\-–—~]*$/;
const Q = "['ʻʼ’‘`´]";
const REF_HEAD = new RegExp(
  '^(?:\\d+[.)]?\\s*)?(?:' +
    `foydalanilgan\\s+adabiyotlar(?:\\s+ro${Q}?yxati)?|adabiyotlar(?:\\s+ro${Q}?yxati)?|references?(?:\\s+list)?|bibliography|` +
    'список\\s+(?:использованн\\p{L}+\\s+)?литератур\\p{L}*|использованная\\s+литература|литература|библиография|' +
    'фойдаланилган\\s+адабиётлар(?:\\s+рўйхати)?|адабиётлар' +
    ')\\s*[:.]?$', 'iu');

// Izohlarni adabiyotlar ro'yxati bilan solishtirish uchun: harf va raqamlardan boshqasi tashlanadi
const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const FN_START = /^\d{1,3}\s*[.)]?\s+(?:\d{1,3}\s*[.)]\s*)?(?=\S)/;

// Raqam bilan boshlangan qisqa abzac qolgan qismi adabiyotlar ro'yxatidagi biror manbaning boshi bilan mos tushsa, u izoh (footnote) hisoblanadi
export function dropFootnotes(blocks, refs) {
  const keys = (refs || []).map(norm).filter((k) => k.length >= 25);
  if (!keys.length) return blocks;
  return blocks.filter((b) => {
    if (b.t === 'h' || b.x.length > 700) return true;
    const m = b.x.match(FN_START);
    if (!m) return true;
    const rest = norm(b.x.slice(m[0].length));
    if (rest.length < 25) return true;
    const head = rest.slice(0, 40);
    return !keys.some((k) => k.includes(head) || rest.includes(k.slice(0, 40)));
  });
}

export function dropNoise(blocks) {
  return (blocks || []).filter((b) => b && typeof b.x === 'string' && !NUM_ONLY.test(b.x));
}

// hasRefs=true bo'lsa va adabiyotlar sarlavhasi matnning ikkinchi yarmida bo'lsa, shu sarlavha va undan keyingi hammasi olib tashlanadi
export function cleanBlocks(blocks, hasRefs, refs) {
  const list = dropFootnotes(dropNoise(blocks), hasRefs ? refs : null);
  if (!hasRefs) return list;
  const total = list.reduce((s, b) => s + b.x.length, 0);
  let acc = 0;
  for (let i = 1; i < list.length; i++) {
    acc += list[i - 1].x.length;
    if (acc >= total * 0.5 && REF_HEAD.test(list[i].x.trim())) return list.slice(0, i);
  }
  return list;
}
