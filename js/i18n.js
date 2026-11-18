/* Sayt interfeysi tili: o'zbek (asosiy), rus, ingliz.
   Faqat interfeys yozuvlari (menyu, tugmalar, sarlavhalar) brauzerda tarjima qilinadi.
   Manzillar va HTML o'zgarmaydi: Google va Google Scholar har doim bitta, asl sahifani ko'radi,
   maqola mazmuni (sarlavha, annotatsiya, matn, adabiyotlar) muallif yozgan tilda qoladi.
   Tanlangan til brauzerda saqlanadi (localStorage). Fayl <head> da defer'siz ulanadi. */
(function () {
  'use strict';
  var KEY = 'siteLang', LANGS = ['uz', 'ru', 'en'];
  var lang = 'uz';
  try { lang = localStorage.getItem(KEY) || 'uz'; } catch (e) {}
  if (LANGS.indexOf(lang) < 0) lang = 'uz';
  var root = document.documentElement;
  if (lang !== 'uz') { root.classList.add('i18n-wait'); root.setAttribute('lang', lang); setTimeout(function () { root.classList.remove('i18n-wait'); }, 1500); }

  // [o'zbekcha, ruscha, inglizcha]
  var D = [
    ["Asosiy mazmunga o'tish", 'Перейти к содержанию', 'Skip to main content'],
    ['Bosh sahifa', 'Главная', 'Home'], ['Jurnallar', 'Журналы', 'Journals'], ['Konferensiyalar', 'Конференции', 'Conferences'],
    ['Fan sohalari', 'Области науки', 'Fields of science'], ['Arxiv', 'Архив', 'Archive'], ['Mualliflar', 'Авторы', 'Authors'],
    ["E'lonlar", 'Объявления', 'Announcements'], ["To'plamlar", 'Сборники', 'Proceedings'], ['Qidiruv', 'Поиск', 'Search'],
    ['Qidirish', 'Искать', 'Search'], ['Izlash', 'Найти', 'Search'], ['Aloqa', 'Контакты', 'Contact'],
    ['Ochiq ilmiy repozitoriy', 'Открытый научный репозиторий', 'Open scholarly repository'],
    ["Sarlavha, muallif, kalit so'z yoki DOI bo'yicha qidirish", 'Поиск по названию, автору, ключевому слову или DOI', 'Search by title, author, keyword or DOI'],
    ['Nashrlar', 'Публикации', 'Publications'], ["Son va to'plamlar", 'Выпуски и сборники', 'Issues and proceedings'],
    ['Jurnallar va konferensiyalar', 'Журналы и конференции', 'Journals and conferences'], ['Jurnal', 'Журнал', 'Journal'], ['Konferensiya', 'Конференция', 'Conference'],
    ['Barchasi', 'Все', 'View all'], ['Maqolalar qabuli', 'Приём статей', 'Call for papers'], ["Ko'p o'qilgan maqolalar", 'Самые читаемые статьи', 'Most read articles'],
    ["So'nggi son va to'plamlar", 'Последние выпуски и сборники', 'Latest issues and proceedings'], ['Ilmiy jurnal', 'Научный журнал', 'Scholarly journal'],
    ["So'nggi nashrlar", 'Последние публикации', 'Latest publications'], ["Yillar bo'yicha", 'По годам', 'By year'],
    ["So'nggi qo'shilganlar", 'Недавно добавленные', 'Recently added'], ['Tashkilotlar', 'Организации', 'Organizations'],
    ['Barcha nashrlar ochiq foydalanishda. Litsenziya:', 'Все публикации в открытом доступе. Лицензия:', 'All publications are open access. License:'],
    ['Sayt xaritasi', 'Карта сайта', 'Sitemap'], ['Atom lenta', 'Лента Atom', 'Atom feed'],
    ['Asosiy menyu', 'Главное меню', 'Main menu'], ['Tilni tanlash', 'Выбор языка', 'Choose language'],
    ['Ilmiy jurnallar: har bir sonning mundarijasi, arxivi va tahririyati', 'Научные журналы: содержание выпусков, архив и редакция', 'Scholarly journals: tables of contents, archive and editorial boards'],
    ["Konferensiya materiallari to'plamlari", 'Сборники материалов конференций', 'Conference proceedings'],
    ['ISSN (bosma)', 'ISSN (печатный)', 'ISSN (print)'], ['ISSN (onlayn)', 'ISSN (онлайн)', 'ISSN (online)'], ['Tashkil etilgan', 'Основан', 'Founded'],
    ['Davriyligi', 'Периодичность', 'Frequency'], ['Nashr tillari', 'Языки публикаций', 'Languages'], ["Ilmiy yo'nalishlar", 'Научные направления', 'Scope'],
    ['Nashriyot', 'Издатель', 'Publisher'], ['Sonlar', 'Выпуски', 'Issues'], ['Maqolalar', 'Статьи', 'Articles'],
    ['Jurnal haqida', 'О журнале', 'About the journal'], ['Konferensiya haqida', 'О конференции', 'About the conference'], ['Joriy son', 'Текущий выпуск', 'Current issue'],
    ["So'nggi to'plam", 'Последний сборник', 'Latest proceedings'], ['Tahririyat', 'Редакция', 'Editorial board'], ['Indekslanish', 'Индексирование', 'Indexing'],
    ['Indekslanish va bazalar', 'Индексирование и базы данных', 'Indexing and databases'], ['Mualliflar uchun', 'Авторам', 'For authors'],
    ['Mualliflar uchun talablar', 'Требования к авторам', 'Author guidelines'], ['Nashr etikasi', 'Публикационная этика', 'Publication ethics'],
    ['Son sahifasi', 'Страница выпуска', 'Issue page'], ["So'nggi maqolalar", 'Последние статьи', 'Latest articles'],
    ['Bosh muharrir', 'Главный редактор', 'Editor-in-chief'], ["Bosh muharrir o'rinbosari", 'Заместитель главного редактора', 'Deputy editor-in-chief'],
    ["Mas'ul kotib", 'Ответственный секретарь', 'Executive secretary'], ["Mas'ul muharrir", 'Ответственный редактор', 'Managing editor'], ['Texnik muharrir', 'Технический редактор', 'Technical editor'], ["Tahrir hay'ati a'zosi", 'Член редколлегии', 'Editorial board member'], ['Boshqa maqolalar', 'Другие статьи', 'Other articles'],
    ['Turi', 'Тип', 'Type'], ['Jurnal soni', 'Выпуск журнала', 'Journal issue'], ['Konferensiya materiallari', 'Материалы конференции', 'Conference proceedings'],
    ["Konferensiya materiallari to'plami", 'Сборник материалов конференции', 'Conference proceedings volume'],
    ['Tom', 'Том', 'Volume'], ['Son', 'Выпуск', 'Issue'], ['Yil', 'Год', 'Year'], ['Sana', 'Дата', 'Date'], ["O'tkazilgan joyi", 'Место проведения', 'Venue'],
    ["Mas'ul muharrir", 'Ответственный редактор', 'Managing editor'], ['Mundarija', 'Содержание', 'Contents'], ['Boshqa sonlar', 'Другие выпуски', 'Other issues'],
    ["Bu songa hali maqola biriktirilmagan.", 'В этот выпуск ещё не добавлены статьи.', 'No articles have been added to this issue yet.'],
    ["Jurnal sonlari va konferensiya materiallari to'plamlari", 'Выпуски журналов и сборники конференций', 'Journal issues and conference proceedings'],
    ['Jurnal maqolasi', 'Статья в журнале', 'Journal article'], ['Konferensiya maqolasi', 'Статья в сборнике конференции', 'Conference paper'],
    ['Konferensiya tezisi', 'Тезисы конференции', 'Conference abstract'], ['Darslik', 'Учебник', 'Textbook'], ["O'quv qo'llanma", 'Учебное пособие', 'Study guide'], ['Monografiya', 'Монография', 'Monograph'],
    ['Nashr yili', 'Год издания', 'Year'], ['Nashr sanasi', 'Дата публикации', 'Publication date'], ['Tom / son', 'Том / выпуск', 'Volume / issue'], ['Betlar', 'Страницы', 'Pages'],
    ["Bo'lim", 'Раздел', 'Section'], ['Fan sohasi', 'Область науки', 'Field of science'], ['Maqola raqami', 'Номер статьи', 'Article number'], ['Maqola tili', 'Язык статьи', 'Language'],
    ['Hajmi', 'Объём', 'Length'], ['Saytga joylangan', 'Размещено на сайте', 'Posted'], ["Oxirgi o'zgarish", 'Последнее изменение', 'Last revised'],
    ["O'zbekcha", 'Узбекский', 'Uzbek'], ['Ruscha', 'Русский', 'Russian'], ['Inglizcha', 'Английский', 'English'],
    ['Annotatsiya', 'Аннотация', 'Abstract'], ["Kalit so'zlar", 'Ключевые слова', 'Keywords'], ['Maqola matni', 'Текст статьи', 'Full text'],
    ["Matn PDF fayldan avtomatik olingan. Jadval, formula va rasmlar uchun PDF nusxaga qarang.", 'Текст автоматически извлечён из PDF. Таблицы, формулы и рисунки см. в PDF-версии.', 'Text extracted automatically from the PDF. See the PDF for tables, formulas and figures.'],
    ["Matnni to'liq ko'rsatish", 'Показать текст полностью', 'Show full text'], ['Qisqartirish', 'Свернуть', 'Show less'],
    ["Maqolani o'qish", 'Читать статью', 'Read the article'], ['Kenglik', 'По ширине', 'Fit width'], ["To'liq ekran", 'Во весь экран', 'Full screen'], ['Yopish', 'Закрыть', 'Close'],
    ["PDF sahifaning o'zida ochiladi.", 'PDF откроется прямо на странице.', 'The PDF opens right on this page.'], ['Maqolani ochish', 'Открыть статью', 'Open the article'],
    ['PDF yuklanmoqda...', 'Загрузка PDF...', 'Loading PDF...'], ["PDF ni sahifada ko'rsatib bo'lmadi.", 'Не удалось показать PDF на странице.', 'The PDF could not be displayed on the page.'],
    ["Ko'rinmasa:", 'Если не отображается:', 'If it does not display:'], ['PDF ni yangi oynada ochish', 'открыть PDF в новом окне', 'open the PDF in a new tab'], ['yoki', 'или', 'or'], ['yuklab olish', 'скачать', 'download'],
    ['Oldingi sahifa', 'Предыдущая страница', 'Previous page'], ['Keyingi sahifa', 'Следующая страница', 'Next page'], ['Kichiklashtirish', 'Уменьшить', 'Zoom out'], ['Kattalashtirish', 'Увеличить', 'Zoom in'],
    ['Foydalanilgan adabiyotlar', 'Список литературы', 'References'], ["Adabiyotlar ro'yxatini yuklab olish (.txt)", 'Скачать список литературы (.txt)', 'Download the reference list (.txt)'],
    ['Iqtibos keltirish', 'Как цитировать', 'Cite this article'], ['Uslub', 'Стиль', 'Style'], ['Nusxa olish', 'Копировать', 'Copy'], ["O'xshash maqolalar", 'Похожие статьи', 'Related articles'],
    ["To'liq matn (PDF)", 'Полный текст (PDF)', 'Full text (PDF)'], ['Yuklab olish', 'Скачать', 'Download'], ["ko'rishlar", 'просмотры', 'views'], ['yuklab olishlar', 'скачивания', 'downloads'],
    ['Ushbu sahifada', 'На этой странице', 'On this page'], ['Adabiyotlar', 'Литература', 'References'], ['Havolani nusxalash', 'Копировать ссылку', 'Copy link'],
    ['Nashr sertifikati', 'Сертификат о публикации', 'Publication certificate'], ['Ochiq foydalanish ·', 'Открытый доступ ·', 'Open access ·'], ["Yo'l", 'Навигация', 'Breadcrumbs'],
    ["Sahifa bo'limlari", 'Разделы страницы', 'Page sections'], ['Havola nusxalandi', 'Ссылка скопирована', 'Link copied'], ['Iqtibos nusxalandi', 'Цитата скопирована', 'Citation copied'],
    ['← Maqola sahifasi', '← Страница статьи', '← Article page'], ['Chop etish yoki PDF saqlash', 'Печать или сохранение в PDF', 'Print or save as PDF'], ['Sertifikat', 'Сертификат', 'Certificate'],
    ['Ushbu sertifikat bilan tasdiqlanadiki,', 'Настоящим сертификатом подтверждается, что', 'This is to certify that'], ['Nashr', 'Издание', 'Publication'],
    ['Ish joyi', 'Место работы', 'Affiliation'], ['Hammualliflar', 'Соавторы', 'Co-authors'], ["Ko'rishlar", 'Просмотры', 'Views'], ['Yuklab olishlar', 'Скачивания', 'Downloads'],
    ['Muallif haqida', 'Об авторе', 'About the author'], ['Jurnal maqolalari', 'Статьи в журналах', 'Journal articles'], ["Kitoblar va qo'llanmalar", 'Книги и пособия', 'Books and textbooks'],
    ['Ilmiy qiziqishlari', 'Научные интересы', 'Research interests'], ['Shaxsiy sahifa', 'Личная страница', 'Personal website'],
    ["Mualliflarning ish joylari bo'yicha nashrlar", 'Публикации по местам работы авторов', 'Publications by author affiliation'],
    ["Nashrlar ilmiy yo'nalishlar bo'yicha", 'Публикации по областям науки', 'Publications by field of science'], ['Boshqa sohalar', 'Другие области', 'Other fields'],
    ["Fan sohalari bo'yicha", 'По областям науки', 'By field of science'], ['Boshqa yillar', 'Другие годы', 'Other years'],
    ["Hech narsa topilmadi. Boshqa so'z bilan qidirib ko'ring.", 'Ничего не найдено. Попробуйте другое слово.', 'Nothing found. Try another word.'],
    ["Saytga joylangan sanasi bo'yicha (yangi qo'shilganlar yuqorida)", 'По дате размещения (новые сверху)', 'By posting date (newest first)'],
    ["Sarlavha, muallif, kalit so'z, jurnal, konferensiya yoki DOI bo'yicha", 'По названию, автору, ключевому слову, журналу, конференции или DOI', 'By title, author, keyword, journal, conference or DOI'],
    ['Natijalar', 'Результаты', 'Results'], ["Qidirish uchun so'z kiriting.", 'Введите слово для поиска.', 'Enter a word to search.'], ['Yuklanmoqda...', 'Загрузка...', 'Loading...'],
    ['Masalan: fitonim, Ikromov yoki 10.5281', 'Например: фитоним, Икромов или 10.5281', 'For example: phytonym, Ikromov or 10.5281'],
    ["Qidiruv indeksini yuklab bo'lmadi.", 'Не удалось загрузить поисковый индекс.', 'Could not load the search index.'],
    ["Konferensiyalarga maqola qabul qilish, yangi sonlar va yangiliklar", 'Приём статей на конференции, новые выпуски и новости', 'Calls for papers, new issues and news'],
    ['Maqolalar qabul qilinmoqda', 'Идёт приём статей', 'Accepting submissions'], ["E'lon sanasi", 'Дата объявления', 'Announced'],
    ['Maqola qabul qilish muddati', 'Срок приёма статей', 'Submission deadline'], ["O'tkaziladigan sana", 'Дата проведения', 'Event date'], ["O'tkaziladigan joy", 'Место проведения', 'Venue'],
    ["Ro'yxatdan o'tish", 'Регистрация', 'Register'], ['Sahifa topilmadi', 'Страница не найдена', 'Page not found'],
    ["Manzil noto'g'ri yoki sahifa ko'chirilgan.", 'Неверный адрес или страница перемещена.', 'The address is wrong or the page has moved.'], ['Bosh sahifaga qaytish', 'На главную', 'Back to home'],
    ['Open access', 'Открытый доступ', 'Open access'], ['Ochiq foydalanish', 'Открытый доступ', 'Open access'],
    // O'zbekiston OAK fan tarmoqlari
    ['Fizika-matematika fanlari', 'Физико-математические науки', 'Physical and mathematical sciences'], ['Kimyo fanlari', 'Химические науки', 'Chemical sciences'],
    ['Biologiya fanlari', 'Биологические науки', 'Biological sciences'], ['Geologiya-mineralogiya fanlari', 'Геолого-минералогические науки', 'Geological and mineralogical sciences'],
    ['Texnika fanlari', 'Технические науки', 'Engineering sciences'], ["Qishloq xo'jaligi fanlari", 'Сельскохозяйственные науки', 'Agricultural sciences'],
    ['Tarix fanlari', 'Исторические науки', 'Historical sciences'], ['Iqtisodiyot fanlari', 'Экономические науки', 'Economic sciences'], ['Falsafa fanlari', 'Философские науки', 'Philosophical sciences'],
    ['Filologiya fanlari', 'Филологические науки', 'Philological sciences'], ['Geografiya fanlari', 'Географические науки', 'Geographical sciences'], ['Yuridik fanlar', 'Юридические науки', 'Legal sciences'],
    ['Pedagogika fanlari', 'Педагогические науки', 'Pedagogical sciences'], ['Tibbiyot fanlari', 'Медицинские науки', 'Medical sciences'], ['Farmatsevtika fanlari', 'Фармацевтические науки', 'Pharmaceutical sciences'],
    ['Veterinariya fanlari', 'Ветеринарные науки', 'Veterinary sciences'], ["San'atshunoslik fanlari", 'Искусствоведение', 'Art history'], ['Arxitektura', 'Архитектура', 'Architecture'],
    ['Psixologiya fanlari', 'Психологические науки', 'Psychological sciences'], ['Harbiy fanlar', 'Военные науки', 'Military sciences'], ['Sotsiologiya fanlari', 'Социологические науки', 'Sociological sciences'],
    ['Siyosiy fanlar', 'Политические науки', 'Political sciences'],
  ];
  // Apostrof turlaridan qat'i nazar bir xil kalit (o' / o‘ / oʻ)
  var nk = function (s) { return String(s).replace(/[ʻʼ‘’`´]/g, "'").replace(/\s+/g, ' ').trim(); };
  var I = lang === 'ru' ? 1 : 2, MAP = {};
  D.forEach(function (r) { MAP[nk(r[0])] = r[I]; });

  // Rus tilida son bilan kelishuv: 1 статья, 2 статьи, 5 статей
  var ruN = function (n, a, b, c) { var m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
  var NOUN = {
    nashr: [['публикация', 'публикации', 'публикаций'], ['publication', 'publications']],
    maqola: [['статья', 'статьи', 'статей'], ['article', 'articles']],
    muallif: [['автор', 'автора', 'авторов'], ['author', 'authors']],
    son: [['выпуск', 'выпуска', 'выпусков'], ['issue', 'issues']],
    "to'plam": [['сборник', 'сборника', 'сборников'], ['volume', 'volumes']],
    tashkilot: [['организация', 'организации', 'организаций'], ['organization', 'organizations']],
    natija: [['результат', 'результата', 'результатов'], ['result', 'results']],
    bet: [['с.', 'с.', 'с.'], ['page', 'pages']],
  };
  var count = function (n, w) {
    var f = NOUN[w]; if (!f) return null; n = Number(String(n).replace(/\D/g, ''));
    return lang === 'ru' ? n + ' ' + ruN(n, f[0][0], f[0][1], f[0][2]) : n + ' ' + (n === 1 ? f[1][0] : f[1][1]);
  };
  var L = function (ru, en) { return lang === 'ru' ? ru : en; };
  var RULES = [
    [/^(\d[\d\s ]*) ta (nashr|maqola|muallif|son|to'plam|tashkilot|natija)$/, function (m) { return count(m[1], m[2]); }],
    [/^(\d+) bet$/, function (m) { return L(m[1] + ' с.', m[1] + (m[1] === '1' ? ' page' : ' pages')); }],
    [/^(\d+)-tom$/, function (m) { return L('т. ' + m[1], 'vol. ' + m[1]); }],
    [/^(\d+)-son$/, function (m) { return L('№ ' + m[1], 'no. ' + m[1]); }],
    [/^Tom (\d+)$/, function (m) { return L('Том ' + m[1], 'Vol. ' + m[1]); }],
    [/^B\. (.+)$/, function (m) { return L('С. ' + m[1], 'pp. ' + m[1]); }],
    [/^(\d{4})-yil nashrlari$/, function (m) { return L('Публикации ' + m[1] + ' года', m[1] + ' publications'); }],
    [/^(\d{4})-yil nashrlari ichidan qidirish$/, function (m) { return L('Поиск среди публикаций ' + m[1] + ' года', 'Search ' + m[1] + ' publications'); }],
    [/^Barcha (\d+) ta nashr yillar bo'yicha$/, function (m) { return L('Все публикации по годам: ' + m[1], 'All ' + m[1] + ' publications by year'); }],
    [/^Barcha (\d+) ta nashr$/, function (m) { return L('Все публикации (' + m[1] + ')', 'All ' + m[1] + ' publications'); }],
    [/^Qabul ochiq: (.+) gacha$/, function (m) { return L('Приём открыт до ' + m[1], 'Open until ' + m[1]); }],
    [/^Qabul yopilgan: (.+) gacha$/, function (m) { return L('Приём закрыт (до ' + m[1] + ')', 'Closed (deadline ' + m[1] + ')'); }],
    [/^boshqa yozilishi: (.+)$/, function (m) { return L('другие написания: ' + m[1], 'also written as: ' + m[1]); }],
    [/^muallifligidagi quyidagi ilmiy ish «(.+)» nashrida chop etilgan:$/, function (m) { return L('является автором научной работы, опубликованной в издании «' + m[1] + '»:', 'is the author of the following work published in “' + m[1] + '”:'); }],
    [/^(\d[\d\s ]*) ko'rish$/, function (m) { return L(m[1] + ' просм.', m[1] + ' views'); }],
    [/^(\d[\d\s ]*) yuklab olish$/, function (m) { return L(m[1] + ' скач.', m[1] + ' downloads'); }],
    [/^Sahifa (\d+)$/, function (m) { return L('Страница ' + m[1], 'Page ' + m[1]); }],
    [/^Dastlabki 200 ta natija ko'rsatildi\. So'rovni aniqlashtiring\.$/, function () { return L('Показаны первые 200 результатов. Уточните запрос.', 'Showing the first 200 results. Refine your search.'); }],
    [/^(.+) bo'limlari$/, function (m) { return L('Разделы: ' + m[1], m[1] + ': sections'); }],
  ];
  function tr(s) {
    var k = nk(s);
    if (!k || /^[\d\s.,:;/–—\-+%‹›·|()«»"“”]*$/.test(k)) return null;
    if (MAP[k]) return MAP[k];
    for (var i = 0; i < RULES.length; i++) { var m = k.match(RULES[i][0]); if (m) return RULES[i][1](m); }
    // Qo'shma yozuvlar: "1-tom · 2-son · B. 264-268", "1 ta muallif · 3 ta nashr", "1-tom, 2-son, 2026"
    var seps = [' · ', ', '];
    for (var j = 0; j < seps.length; j++) {
      if (k.indexOf(seps[j]) < 0) continue;
      var parts = k.split(seps[j]), hit = false;
      var outp = parts.map(function (p) { var t = tr(p); if (t) { hit = true; return t; } return p; });
      if (hit) return outp.join(seps[j]);
    }
    var tail = k.match(/^(.+?)\s*([·:])$/);
    if (tail) { var t3 = tr(tail[1]); if (t3) return t3 + (tail[2] === ':' ? ':' : ' ·'); }
    var lead = k.match(/^(←\s*)(.+)$/) || k.match(/^(.+?)(\s*→)$/);
    if (lead) { var t2 = lead[1].indexOf('←') >= 0 ? tr(lead[2]) : tr(lead[1]); if (t2) return lead[1].indexOf('←') >= 0 ? lead[1] + t2 : t2 + lead[2]; }
    return null;
  }

  // Maqola mazmuni va foydalanuvchi kiritgan matnlar tarjima qilinmaydi
  var SKIP = '[lang]:not(html),.prose,.ref-list,.cite-text,.entry-title,.entry-by,.entry-abs,.byline,.affils,.kw .chip,.ti-t,.added a,.rel a,.cert-name,.cert-title,.cert-aff,.board strong,.series-card strong,.series-d,.news-card strong,.issue-b strong,.cover-t,.brand,.foot-brand,.au-int,.au-org,.authors-grid a,.co a,.org-grid strong,script,style,textarea,code,[data-noi18n]';
  var ATTRS = ['placeholder', 'aria-label', 'title'];
  function node(n) {
    var p = n.parentElement;
    // Annotatsiya bloklarining sarlavhalari interfeys qismi: ular tarjima qilinadi
    if (!p || (p.closest(SKIP) && !p.closest('.abs > h2, .kw > strong'))) return;
    var v = n.nodeValue, t = tr(v);
    if (t) n.nodeValue = v.replace(/^(\s*)[\s\S]*?(\s*)$/, function (m0, a, b) { return a + t + b; });
  }
  function el(e) {
    if (e.closest && e.closest(SKIP)) return;
    ATTRS.forEach(function (a) { var v = e.getAttribute && e.getAttribute(a); if (v) { var t = tr(v); if (t) e.setAttribute(a, t); } });
  }
  function walk(r) {
    if (r.nodeType === 3) { node(r); return; }
    if (r.nodeType !== 1) return;
    el(r);
    var w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), x;
    while ((x = w.nextNode())) { if (x.nodeType === 3) node(x); else el(x); }
  }
  function title() {
    var parts = document.title.split(' - ');
    var t = tr(parts[0]) || (parts[0].indexOf(': ') > 0 ? null : null);
    var m = parts[0].match(/^(.+): ilmiy maqolalar$/);
    if (m) t = (MAP[nk(m[1])] || m[1]) + L(': научные статьи', ': scholarly articles');
    if (/^Sertifikat: /.test(parts[0])) t = L('Сертификат: ', 'Certificate: ') + parts[0].slice(12);
    if (t) { parts[0] = t; document.title = parts.join(' - '); }
  }

  // Bayroqlar (SVG)
  var FLAG = {
    uz: '<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#1eb53a"/><rect width="30" height="13.2" fill="#fff"/><rect width="30" height="6.4" fill="#0099b5"/><rect y="6.4" width="30" height=".5" fill="#ce1126"/><rect y="12.7" width="30" height=".5" fill="#ce1126"/><circle cx="5" cy="3.2" r="2.1" fill="#fff"/><circle cx="5.8" cy="3.2" r="1.8" fill="#0099b5"/><g fill="#fff"><circle cx="9" cy="2" r=".45"/><circle cx="10.6" cy="2" r=".45"/><circle cx="12.2" cy="2" r=".45"/><circle cx="9" cy="3.5" r=".45"/><circle cx="10.6" cy="3.5" r=".45"/><circle cx="12.2" cy="3.5" r=".45"/><circle cx="10.6" cy="5" r=".45"/><circle cx="12.2" cy="5" r=".45"/></g></svg>',
    ru: '<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#d52b1e"/><rect width="30" height="13.3" fill="#0039a6"/><rect width="30" height="6.7" fill="#fff"/></svg>',
    en: '<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="gbt"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#gbt)" stroke="#c8102e" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#c8102e" stroke-width="6"/></svg>',
  };
  var NAMES = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };
  function switcher() {
    var box = document.querySelector('[data-lang-switch]');
    if (!box) return;
    var btn = box.querySelector('.lang-btn'), menu = box.querySelector('.lang-menu');
    btn.innerHTML = '<span class="flag">' + FLAG[lang] + '</span><span class="lang-code">' + lang.toUpperCase() + '</span>';
    btn.setAttribute('aria-label', (MAP[nk('Tilni tanlash')] || 'Tilni tanlash') + ': ' + NAMES[lang]);
    menu.innerHTML = LANGS.map(function (l) {
      return '<li><button type="button" role="menuitemradio" aria-checked="' + (l === lang) + '" data-set-lang="' + l + '"><span class="flag">' + FLAG[l] + '</span><span>' + NAMES[l] + '</span></button></li>';
    }).join('');
    var open = function (v) { menu.hidden = !v; btn.setAttribute('aria-expanded', String(v)); };
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(menu.hidden); });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-set-lang]'); if (!b) return;
      var l = b.getAttribute('data-set-lang');
      try { localStorage.setItem(KEY, l); } catch (err) {}
      if (l !== lang) location.reload(); else open(false);
    });
  }

  function start() {
    switcher();
    if (lang !== 'uz') {
      walk(document.body); title();
      new MutationObserver(function (list) {
        list.forEach(function (m) {
          if (m.type === 'characterData') node(m.target);
          else m.addedNodes.forEach(function (n) { walk(n); });
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    root.classList.remove('i18n-wait');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.siteLang = lang;
})();
