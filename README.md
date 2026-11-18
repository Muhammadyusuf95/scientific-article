# Ilmiy Maqolalar Portali (uzlibrary.uz)

Cloudflare Pages: build buyrug'i `node build.js`, chiqish papkasi `dist`. PDF fayllar R2 (`R2_OMBOR`) da saqlanadi.

## Admin panel (`/admin.html`)
* **Nashr joylash**: yangi maqola yoki tahrirlash. PDF tanlanganda Google Scholar tekshiruvi (hajm, matn qatlami, sarlavha va mualliflar birinchi betda, adabiyotlar bo'limi) avtomatik o'tkaziladi.
* **Foydalanilgan adabiyotlar (References)**: maydon bo'sh qolsa, saqlash paytida ro'yxat PDF oxiridan avtomatik olinadi (har bir manba alohida qatorda).
* **Nashrlar**: ro'yxat, ko'rishlar va yuklab olishlar soni, Google Scholar bo'yicha ogohlantirishlar.
* **To'plamlar**: yaratish, tahrirlash, maqolalarni biriktirish, o'chirish (maqolalar saytda qoladi).
* **Sahifalar > Muallif ismlari**: bir muallifning turlicha yozilgan ismlarini birlashtirish. Saytda bitta muallif sahifasi qoladi, eski sahifa 301 bilan yo'naltiriladi; "boshqa yozilishlar"ni ko'rsatish ixtiyoriy. `citation_author` o'zgarmaydi (har bir maqola PDF dagi yozuvni saqlaydi).
* **Sahifalar**: sayt nomi, tavsifi, "Portal haqida", "Tahririyat hay'ati", "Nashr etikasi", "Aloqa" va yangi sahifalar.

## Jurnal va konferensiyalar (nashr seriyalari)
Admin panel > **Jurnal va konferensiyalar**: har bir jurnal yoki doimiy konferensiyaning o'z sahifasi (`/journal/<id>/` yoki `/conference/<id>/`): tavsif, ISSN, davriyligi, tillari, yo'nalishlari, tahririyat (ORCID bilan), indekslanish ro'yxati, mualliflar uchun talablar (`.../guidelines/`), nashr etikasi (`.../ethics/`), joriy son va arxiv.
**Son va to'plamlar** bo'limida son jurnal yoki konferensiyaga biriktiriladi (tom va son raqami bilan). Maqolada bo'sh qolgan jurnal nomi, tom, son, ISSN va ISBN sondan va seriyadan avtomat olinadi.

## Maqola sahifasidagi qo'shimchalar
* **Mualliflar haqida** maydoni: har bir qator bitta muallifga mos, "Ish joyi | ORCID". Google Scholar uchun `citation_author_institution`, sahifada ORCID belgisi.
* **Bo'lim (fan sohasi)**: son mundarijasi shu bo'limlar bo'yicha guruhlanadi; maqola raqami (masalan FM-1-2-003) avtomat beriladi.
* O'xshash maqolalar, chop etiladigan **nashr sertifikati** (`/article/<id>/certificate/`, qidiruv tizimlari uchun yopiq), `citation_publisher` va `citation_online_date` teglari.

## E'lonlar
Admin panel > **E'lonlar**: konferensiyaga maqola qabul qilish va yangiliklar (`/news/`). Qabul muddati o'tmagan e'lonlar "Qabul ochiq" belgisi bilan chiqadi.

## Arxiv, qidiruv, lenta va OAI-PMH
* `/archive/` va `/archive/<yil>/`: barcha nashrlar yillar bo'yicha (Google Scholar tavsiyasi: sana bo'yicha ko'rish). Bosh sahifada faqat so'nggi 12 ta nashr chiqadi.
* `/search/`: butun sayt bo'yicha qidiruv (`/data/search.json` indeksi).
* `/feed.xml`: Atom lenta (so'nggi 50 nashr).
* `/oai`: OAI-PMH 2.0 (oai_dc) - BASE, OpenAIRE, CORE kabi yig'uvchilar uchun. Masalan: `/oai?verb=Identify`, `/oai?verb=ListRecords&metadataPrefix=oai_dc`.

## Lokal sinov
`DATA_FILE=boshqa.json node build.js` - boshqa ma'lumot fayli bilan yig'ish (repodagi `articles.json` o'zgarmaydi).

## To'liq matn maqola sahifasida
PDF tanlanganda admin panel uning matnini xatboshi va sarlavhalar bilan ajratib oladi (kolontitul, bet raqami, telefon va e-pochta qatorlari olib tashlanadi) va R2 ga `text/<id>.json` sifatida saqlaydi. `functions/article/_middleware.js` matnni maqola sahifasiga server tomonida qo'yadi va `citation_fulltext_html_url` tegini qo'shadi: Google va Google Scholar matnni sahifaning o'zida to'liq o'qiydi. PDF (`citation_pdf_url`) avvalgidek qoladi.
Eski maqolalar uchun: **Nashrlar** bo'limidagi "To'liq matnlarni yaratish" tugmasi (yoki har bir maqoladagi "Matn" tugmasi). Bu `articles.json` ni o'zgartirmaydi va saytni qayta yig'ishni talab qilmaydi.

## Fan sohalari, tashkilotlar, muallif profillari
* Maqola (yoki jurnal/konferensiya) uchun **Fan sohasi**: `/fields/` va `/field/<soha>/` sahifalari (annotatsiya parchasi bilan).
* Mualliflarning ish joylari bo'yicha `/organizations/` va `/organization/<nom>/`.
* Admin panel > **Muallif profillari**: ilmiy daraja, lavozim, ish joyi, muallif haqida, ilmiy qiziqishlar, ORCID, Google Scholar, ResearchGate. Muallif sahifasida hammualliflar, nashrlar turlar bo'yicha va jami ko'rishlar/yuklab olishlar chiqadi.
* `/latest/`: saytga joylangan sanasi bo'yicha so'nggi qo'shilganlar. Maqolada bet soni, joylangan va oxirgi o'zgartirilgan sana, EndNote (.enw) eksporti.
* `/stats?ids=a,b` va `/stats?top=10` (ochiq): muallif sahifasi va bosh sahifadagi "Ko'p o'qilgan maqolalar" uchun.

## PDF manzillari
PDF almashtirilganda manzil o'zgarmaydi (eski nusxa R2 dagi `deleted/` papkasiga arxivlanadi). Eski nom bilan so'ralgan PDF amaldagisiga 301 bilan yo'naltiriladi.

## Statistika
Ko'rishlar va yuklab olishlar R2 dagi `stats/` papkasida saqlanadi. Ixtiyoriy: Cloudflare D1 bazasi `STATS_DB` nomi bilan ulansa, avtomatik o'shanga o'tadi.

## Kerakli sozlamalar (Cloudflare Pages > Settings > Variables and Secrets)
`ADMIN_TOKEN`, `GITHUB_TOKEN` (maxfiy), `GITHUB_REPO` (wrangler.toml da), ixtiyoriy `GITHUB_BRANCH`.
