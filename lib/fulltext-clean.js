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

export function dropNoise(blocks) {
  return (blocks || []).filter((b) => b && typeof b.x === 'string' && !NUM_ONLY.test(b.x));
}

// hasRefs=true bo'lsa va adabiyotlar sarlavhasi matnning ikkinchi yarmida bo'lsa, shu sarlavha va undan keyingi hammasi olib tashlanadi
export function cleanBlocks(blocks, hasRefs) {
  const list = dropNoise(blocks);
  if (!hasRefs) return list;
  const total = list.reduce((s, b) => s + b.x.length, 0);
  let acc = 0;
  for (let i = 1; i < list.length; i++) {
    acc += list[i - 1].x.length;
    if (acc >= total * 0.5 && REF_HEAD.test(list[i].x.trim())) return list.slice(0, i);
  }
  return list;
}
