# Ilmiy Maqolalar Portali (uzlibrary.uz)

Cloudflare Pages: build buyrug'i `node build.js`, chiqish papkasi `dist`. PDF fayllar R2 (`R2_OMBOR`) da saqlanadi.

## Admin panel (`/admin.html`)
* **Nashr joylash**: yangi maqola yoki tahrirlash. PDF tanlanganda Google Scholar tekshiruvi (hajm, matn qatlami, sarlavha va mualliflar birinchi betda, adabiyotlar bo'limi) avtomatik o'tkaziladi.
* **Mualliflar paneli**: har bir muallif uchun Familiya, Ism va Otasining ismi alohida maydonlarda (`js/author-panel.js`). Ular avtomatik "Familiya, Ism Otasining ismi" ko'rinishida `authors` ga yoziladi, qo'shimcha ravishda maqolada `author_names` saqlanadi. Eski matn maydoni ("Mualliflar") ishlashda qoladi: unga qo'lda yozilsa qatorlar qayta quriladi. `author_names` bo'lmagan eski maqolalar `authors` matnidan o'qiladi, `articles.json` ni o'zgartirish shart emas.
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

## Google / Google Scholar uchun qo'shimchalar (oxirgi yangilanish)
* **Meta description**: so'z o'rtasida uzilmaydi, gap yoki so'z chegarasida ~155 belgida tugaydi (`metaDesc` funksiyasi, build.js). Bosh sahifada admin panelda kiritilgan "Qisqacha tavsif" 170 belgidan qisqa bo'lsa, o'sha ishlatiladi; uzun bo'lsa avtomatik tavsif tuziladi (sahifadagi matn o'zgarmaydi).
* **Sarlavha (`<title>`)**: sayt nomi faqat jami 70 belgidan oshmasa qo'shiladi, uzun maqola sarlavhasi qidiruvda kesilmaydi.
* **BreadcrumbList** (JSON-LD) har bir maqola sahifasida: sahifadagi "Bosh sahifa / ..." yo'liga mos.
* **Favicon va rasmlar**: `favicon.ico`, `img/` papkasi (favicon.svg, icon-48/192/512.png, apple-touch-icon.png, og-default.png). Google qidiruvda favicon ko'rsatishi uchun alohida fayl kerak (avval faqat data: manzil edi). Ijtimoiy tarmoqda havola `og:image` bilan chiqadi. Rasmni almashtirish uchun shu fayllarni o'z logotipingiz bilan almashtiring (nomlari va o'lchamlari o'zgarmasin).
* **ORCID**: bir muallifning ORCID i bitta nashrda ko'rsatilgan bo'lsa, build uni shu muallifning boshqa nashrlariga ham o'tkazadi (`citation_author_orcid`, JSON-LD, muallif qatori). Qo'lda kiritilgan qiymat o'zgarmaydi. Ish joyi avtomatik o'tkazilmaydi: u har bir nashrda PDF dagi yozuvga mos, admin panelda qo'lda kiritilishi kerak.
* **sitemap.xml**: ro'yxat sahifalari (bosh sahifa, arxiv, muallif, soha, tashkilot, son) uchun ham `lastmod` (ichidagi eng yangi nashr sanasi).
* **Maqola matni (server tomonida)**: faqat raqamdan iborat qatorlar (bet/snoska raqami) chiqarilmaydi; sahifada alohida "Adabiyotlar" bo'limi bo'lsa, matn ichidagi takroriy ro'yxat olib tashlanadi (`lib/fulltext-clean.js`). R2 dagi matn fayllari o'zgarmaydi.
* **`citation_fulltext_world_readable`** (Google Scholar): PDF bor har bir maqola sahifasida bo'sh qiymatli `<meta name="citation_fulltext_world_readable" content="">` teg chiqadi. U to'liq matn ro'yxatdan o'tmasdan, hammaga bepul ochiqligini mashina o'qiydigan shaklda bildiradi (sertifikat sahifalarida chiqmaydi).
* **Matn tozalash (`tidy`)**: sarlavha va annotatsiyadagi ortiqcha bo'shliq va qator uzilishlari (PDF dan nusxalashdan qolgan `\r\n`, qo'sh bo'shliq) meta teglar va JSON-LD da bitta bo'shliqqa keltiriladi. `articles.json` dagi asl matn o'zgarmaydi.
