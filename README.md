# Ilmiy Maqolalar Portali (uzlibrary.uz)

Cloudflare Pages: build buyrug'i `node build.js`, chiqish papkasi `dist`. PDF fayllar R2 (`R2_OMBOR`) da saqlanadi.

## Admin panel (`/admin.html`)
* **Nashr joylash**: yangi maqola yoki tahrirlash. PDF tanlanganda Google Scholar tekshiruvi (hajm, matn qatlami, sarlavha va mualliflar birinchi betda, adabiyotlar bo'limi) avtomatik o'tkaziladi.
* **Foydalanilgan adabiyotlar (References)**: maydon bo'sh qolsa, saqlash paytida ro'yxat PDF oxiridan avtomatik olinadi (har bir manba alohida qatorda).
* **Nashrlar**: ro'yxat, ko'rishlar va yuklab olishlar soni, Google Scholar bo'yicha ogohlantirishlar.
* **To'plamlar**: yaratish, tahrirlash, maqolalarni biriktirish, o'chirish (maqolalar saytda qoladi).
* **Sahifalar > Muallif ismlari**: bir muallifning turlicha yozilgan ismlarini birlashtirish. Saytda bitta muallif sahifasi qoladi, eski sahifa 301 bilan yo'naltiriladi; "boshqa yozilishlar"ni ko'rsatish ixtiyoriy. `citation_author` o'zgarmaydi (har bir maqola PDF dagi yozuvni saqlaydi).
* **Sahifalar**: sayt nomi, tavsifi, "Portal haqida", "Tahririyat hay'ati", "Nashr etikasi", "Aloqa" va yangi sahifalar.

## PDF manzillari
PDF almashtirilganda manzil o'zgarmaydi (eski nusxa R2 dagi `deleted/` papkasiga arxivlanadi). Eski nom bilan so'ralgan PDF amaldagisiga 301 bilan yo'naltiriladi.

## Statistika
Ko'rishlar va yuklab olishlar R2 dagi `stats/` papkasida saqlanadi. Ixtiyoriy: Cloudflare D1 bazasi `STATS_DB` nomi bilan ulansa, avtomatik o'shanga o'tadi.

## Kerakli sozlamalar (Cloudflare Pages > Settings > Variables and Secrets)
`ADMIN_TOKEN`, `GITHUB_TOKEN` (maxfiy), `GITHUB_REPO` (wrangler.toml da), ixtiyoriy `GITHUB_BRANCH`.
