(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'admin_token_v3';
  const IDLE_MS = 20 * 60 * 1000;
  let idleTimer = null;
  const state = { articles: [], collections: [], series: [], news: [], site: {}, pages: {}, stats: {}, editingId: null, collEditing: null, seriesEditing: null, newsEditing: null, pdfInfo: null, profiles: [], ftIds: new Set(), fullText: null, profEditing: null };
  // O'zbekiston OAK fan tarmoqlari nomlari (tavsiya; boshqa nom ham yozish mumkin)
  const FIELDS_DEFAULT = ['Fizika-matematika fanlari', 'Kimyo fanlari', 'Biologiya fanlari', 'Geologiya-mineralogiya fanlari', 'Texnika fanlari', "Qishloq xo'jaligi fanlari", 'Tarix fanlari', 'Iqtisodiyot fanlari', 'Falsafa fanlari', 'Filologiya fanlari', 'Geografiya fanlari', 'Yuridik fanlar', 'Pedagogika fanlari', 'Tibbiyot fanlari', 'Farmatsevtika fanlari', 'Veterinariya fanlari', "San'atshunoslik fanlari", 'Arxitektura', 'Psixologiya fanlari', 'Harbiy fanlar', 'Sotsiologiya fanlari', 'Siyosiy fanlar'];

  const LANGS = [
    { code: 'uz', label: "O'zbekcha" },
    { code: 'en', label: 'Inglizcha' },
    { code: 'ru', label: 'Ruscha' },
  ];
  const KIND = {
    'jurnal-maqolasi': 'journal', 'konferensiya-maqolasi': 'conf', 'konferensiya-tezisi': 'conf',
    'darslik': 'book', 'oquv-qollanma': 'book', 'monografiya': 'book',
  };
  const PAGE_NAMES = { about: 'Portal haqida', 'editorial-board': "Tahririyat hay'ati", ethics: 'Nashr etikasi', contact: 'Aloqa' };
  const PATRONYM = /^(?:o['ʻʼ‘’`´]?g['ʻʼ‘’`´]?li|ogli|ugli|ogly|ugly|qizi|kizi|kyzy|ўғли|ўгли|угли|қизи|кизи|оглы|кызы)$/i; // citations.js bilan bir xil

  function getToken() { try { return sessionStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function setToken(t) { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch (_) {} }

  function resetIdle() {
    clearTimeout(idleTimer);
    if (getToken()) idleTimer = setTimeout(() => doLogout("20 daqiqa faoliyat bo'lmagani uchun tizimdan chiqildi."), IDLE_MS);
  }
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));

  function msg(el, text, type = '') {
    if (!el) return;
    el.textContent = text || '';
    el.className = (el.id === 'refsMsg' ? 'small ' : 'msg ') + type;
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { 'X-Admin-Token': getToken(), ...(opts.headers || {}) } });
    if (res.status === 401 || res.status === 403) { doLogout("Admin kaliti noto'g'ri yoki muddati tugagan."); throw new Error("Ruxsat yo'q"); }
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || data.success === false) throw new Error(data.error || `Xatolik (${res.status})`);
    return data;
  }
  const postJson = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  // ---------- Ism va sarlavha yordamchilari ----------
  function nameParts(full) {
    const s = String(full || '').replace(/\s+/g, ' ').trim();
    let family = s, given = '';
    if (s.includes(',')) { const k = s.indexOf(','); family = s.slice(0, k).trim(); given = s.slice(k + 1).trim(); }
    else { const sp = s.indexOf(' '); if (sp > 0) { family = s.slice(0, sp); given = s.slice(sp + 1).trim(); } }
    return { family, toks: given.split(' ').filter((t) => t && !PATRONYM.test(t)) };
  }
  const fold = (s) => String(s || '').toLowerCase().replace(/[ʻʼ‘’`´']/g, '').replace(/\s+/g, ' ').trim();
  const scholarName = (n) => { const p = nameParts(n); return p.toks.length ? `${p.family}, ${p.toks.join(' ')}` : p.family; };
  const isCaps = (t) => !!t && t === t.toUpperCase() && t !== t.toLowerCase() && t.replace(/[^\p{L}]/gu, '').length > 8;
  function sentenceCase(t) {
    const l = t.toLowerCase();
    return l.replace(/^(\P{L}*)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
  }

  // Muallif ismlari boshqa nashrlardagidan farq qilsa ogohlantiradi
  function authorWarnings(list, exceptId) {
    const known = {};
    state.articles.filter((a) => a.id !== exceptId).forEach((a) => (a.authors || []).forEach((n) => {
      const f = fold(nameParts(n).family);
      (known[f] = known[f] || new Set()).add(n);
    }));
    const out = [];
    list.forEach((n) => {
      const f = fold(nameParts(n).family);
      if (!known[f]) return;
      const diff = [...known[f]].filter((k) => fold(scholarName(k)) !== fold(scholarName(n)) && !sameGroup(k, n));
      if (diff.length) out.push(`"${n}" boshqa nashrlarda ${diff.map((k) => `"${k}"`).join(', ')} deb yozilgan. Bir odam bo'lsa, ismni PDF dagidek qoldiring va "Sahifalar > Muallif ismlari" bo'limida birlashtiring.`);
    });
    return out;
  }

  // ---------- Til yorliqlari ----------
  let activeLang = 'uz';
  function initLangTabs() {
    const tabs = $('tabs'), panels = $('langPanels');
    tabs.innerHTML = ''; panels.innerHTML = '';
    LANGS.forEach(({ code, label }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab' + (code === activeLang ? ' active' : '');
      b.textContent = label;
      b.onclick = () => {
        activeLang = code;
        [...tabs.children].forEach((x, i) => x.classList.toggle('active', LANGS[i].code === code));
        [...panels.children].forEach((x) => (x.hidden = x.dataset.lang !== code));
      };
      tabs.appendChild(b);

      const p = document.createElement('div');
      p.dataset.lang = code;
      p.hidden = code !== activeLang;
      p.innerHTML = `
        <div class="field">
          <div class="between"><label class="lbl" id="lbl_title_${code}" for="title_${code}">Sarlavha (${label})</label>
          <button class="btn ghost sm" type="button" data-case="${code}" title="KATTA HARFLARDAGI sarlavhani oddiy yozuvga o'tkazish">Aa</button></div>
          <input type="text" name="title_${code}" id="title_${code}" maxlength="300">
          <span class="hint warn" id="caps_${code}" hidden>Sarlavha to'liq KATTA HARFLARDA. Google Scholar uni xuddi shunday ko'rsatadi. "Aa" tugmasi bilan oddiy yozuvga o'tkazing, so'ng atoqli otlarni tekshiring.</span>
        </div>
        <label class="field">
          <span class="lbl" id="lbl_abs_${code}">Annotatsiya (${label})</span>
          <textarea name="abstract_${code}" id="abstract_${code}" rows="4" maxlength="6000"></textarea>
        </label>
        <label class="field">
          <span class="lbl" id="lbl_kw_${code}">Kalit so'zlar (${label})</span>
          <input type="text" name="keywords_${code}" id="keywords_${code}" placeholder="kalit so'z 1, kalit so'z 2">
          <span class="hint">Vergul yoki nuqtali vergul bilan ajrating.</span>
        </label>`;
      panels.appendChild(p);
      const t = p.querySelector(`#title_${code}`);
      const upd = () => { $(`caps_${code}`).hidden = !isCaps(t.value.trim()); };
      t.addEventListener('input', upd);
      p.querySelector('[data-case]').onclick = () => { if (t.value.trim()) { t.value = sentenceCase(t.value.trim()); upd(); t.focus(); } };
    });
    updateRequiredLangMarkers();
  }
  function updateRequiredLangMarkers() {
    const main = $('language').value || 'uz';
    LANGS.forEach(({ code }) => ['title', 'abs', 'kw'].forEach((k) => {
      const el = $(`lbl_${k}_${code}`);
      if (el) el.classList.toggle('req', code === main);
    }));
  }
  function refreshCapsHints() { LANGS.forEach(({ code }) => { const t = $(`title_${code}`); if (t) $(`caps_${code}`).hidden = !isCaps(t.value.trim()); }); }

  // ---------- To'plam tanlash (nashr formasi) ----------
  function renderCollectionPanels() {
    const box = $('collPanels');
    const jColls = state.collections.filter((c) => c.type !== 'conf');
    const cColls = state.collections.filter((c) => c.type !== 'journal');
    box.innerHTML = `
      <div class="coll-group">
        <label class="check" style="margin-top:0"><input type="checkbox" id="chkJournalColl">
          <span><strong>Jurnal to'plami</strong> (jurnal sonidagi maqolalarni to'plam sifatida birlashtirish)</span></label>
        <div class="coll-body" id="bodyJournalColl" hidden><div class="grid">
          <label class="field"><span class="lbl">Mavjud jurnal to'plamini tanlash</span>
            <select id="selJournalColl"><option value="">— Yangi to'plam nomini qo'lda yozish —</option>
            ${jColls.map((c) => `<option value="${esc(c.id)}" data-name="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span class="lbl">To'plam yoki jurnal soni nomi (qo'lda yozish)</span>
            <input type="text" id="inpJournalColl" maxlength="200" placeholder="Masalan: O'zbekiston ilmiy jurnali, 2026, 2-son"></label>
        </div></div>
      </div>
      <div class="coll-group">
        <label class="check" style="margin-top:0"><input type="checkbox" id="chkConfColl">
          <span><strong>Konferensiya to'plami</strong> (konferensiya materiallarini to'plam sifatida birlashtirish)</span></label>
        <div class="coll-body" id="bodyConfColl" hidden><div class="grid">
          <label class="field"><span class="lbl">Mavjud konferensiya to'plamini tanlash</span>
            <select id="selConfColl"><option value="">— Yangi to'plam nomini qo'lda yozish —</option>
            ${cColls.map((c) => `<option value="${esc(c.id)}" data-name="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span class="lbl">Konferensiya to'plami nomi (qo'lda yozish)</span>
            <input type="text" id="inpConfColl" maxlength="200" placeholder="Masalan: Filologiyaning dolzarb masalalari, 2026"></label>
        </div></div>
      </div>`;
    const chkJ = $('chkJournalColl'), chkC = $('chkConfColl');
    chkJ.onchange = () => { if (chkJ.checked) chkC.checked = false; $('bodyJournalColl').hidden = !chkJ.checked; $('bodyConfColl').hidden = !chkC.checked; };
    chkC.onchange = () => { if (chkC.checked) chkJ.checked = false; $('bodyConfColl').hidden = !chkC.checked; $('bodyJournalColl').hidden = !chkJ.checked; };
    $('selJournalColl').onchange = function () { const o = this.options[this.selectedIndex]; $('inpJournalColl').value = o && o.dataset.name ? o.dataset.name : ''; fillFromColl(this.value); };
    $('selConfColl').onchange = function () { const o = this.options[this.selectedIndex]; $('inpConfColl').value = o && o.dataset.name ? o.dataset.name : ''; fillFromColl(this.value); };
  }
  // Son tanlanganda maqolaning bo'sh maydonlari son va jurnal/konferensiya ma'lumotidan to'ldiriladi
  function fillFromColl(id) {
    const c = state.collections.find((x) => x.id === id);
    if (!c) return;
    const s = state.series.find((x) => x.id === c.series);
    const set = (el, v) => { if (el && !el.value && v) el.value = v; };
    set($('f_journal_name'), s && s.type === 'journal' ? s.name : (c.type === 'journal' ? c.name : ''));
    set($('f_volume'), c.volume); set($('f_issue'), c.number);
    set($('f_conference_org'), c.type !== 'journal' ? c.name : '');
    set($('f_conference_place'), c.place); set($('f_conference_date'), c.date);
    set(document.querySelector('[name="issn"]'), c.issn || (s && (s.issn || s.eissn)));
    set(document.querySelector('[name="isbn"]'), c.isbn);
  }
  function getSelectedCollectionData() {
    if ($('chkJournalColl')?.checked) return { id: $('selJournalColl').value.trim(), name: $('inpJournalColl').value.trim(), type: 'journal' };
    if ($('chkConfColl')?.checked) return { id: $('selConfColl').value.trim(), name: $('inpConfColl').value.trim(), type: 'conf' };
    return null;
  }

  // ---------- Turga qarab qo'shimcha maydonlar ----------
  function renderExtraFields() {
    const kind = KIND[$('item_type').value] || 'journal';
    const extra = $('extra');
    if (kind === 'journal') {
      extra.innerHTML = `
        <label class="field full"><span class="lbl req">Jurnal nomi</span><input name="journal_name" id="f_journal_name" maxlength="200" required></label>
        <label class="field"><span class="lbl">Tom (Volume)</span><input name="volume" id="f_volume" maxlength="40"></label>
        <label class="field"><span class="lbl">Son (Issue)</span><input name="issue" id="f_issue" maxlength="40"></label>
        <label class="field"><span class="lbl">Betlar</span><input name="pages" id="f_pages" placeholder="10-18" maxlength="40"></label>`;
    } else if (kind === 'conf') {
      extra.innerHTML = `
        <label class="field full"><span class="lbl req">Konferensiya nomi</span><input name="conference_org" id="f_conference_org" maxlength="200" required></label>
        <label class="field"><span class="lbl">O'tkazilgan joyi</span><input name="conference_place" id="f_conference_place" maxlength="120"></label>
        <label class="field"><span class="lbl">Konferensiya sanasi</span><input name="conference_date" id="f_conference_date" maxlength="60" placeholder="14.10.2026"></label>
        <label class="field"><span class="lbl">Betlar</span><input name="pages" id="f_pages" placeholder="405-409" maxlength="40"></label>`;
      $('f_conference_date').addEventListener('change', checkDates);
    } else {
      extra.innerHTML = `
        <label class="field full"><span class="lbl">Nashriyot</span><input name="publisher" id="f_publisher" maxlength="200"></label>
        <label class="field"><span class="lbl">Nashr shahri</span><input name="publisher_city" id="f_publisher_city" maxlength="100"></label>
        <label class="field"><span class="lbl">Nashr (Edition)</span><input name="edition" id="f_edition" maxlength="60"></label>
        <label class="field"><span class="lbl">Umumiy betlar soni</span><input name="total_pages" id="f_total_pages" maxlength="40"></label>`;
    }
    const maxMb = kind === 'book' ? 25 : 5;
    $('sizeHint').textContent = `Maksimal hajm: ${maxMb} MB (Google Scholar indeksatsiyasi uchun 5 MB gacha bo'lishi shart).`;
  }

  // Konferensiya sanasi va nashr sanasi mosligi
  function lastDate(text) {
    const all = String(text || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g);
    if (!all) return '';
    const [d, m, y] = all[all.length - 1].split('.');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  function checkDates() {
    const hint = $('dateHint');
    const cd = $('f_conference_date') ? lastDate($('f_conference_date').value) : '';
    const d = $('date').value, y = $('year').value;
    const notes = [];
    if (cd && !d) { $('date').value = cd; $('year').value = cd.slice(0, 4); notes.push('Nashr sanasi konferensiya sanasidan avtomatik olindi. Agar to\'plam boshqa kuni chiqqan bo\'lsa, o\'zgartiring.'); }
    else if (cd && d && cd !== d) notes.push(`Nashr sanasi (${d.split('-').reverse().join('.')}) konferensiya sanasidan (${cd.split('-').reverse().join('.')}) farq qiladi. To'plam haqiqatan shu kuni chiqqan bo'lsa, shunday qoldiring; aks holda bir xil qiling.`);
    if ($('date').value && y && $('date').value.slice(0, 4) !== String(y)) notes.push('Nashr yili va nashr sanasidagi yil mos emas.');
    hint.textContent = notes.join(' ');
    hint.hidden = !notes.length;
  }

  // ---------- pdf.js (saytning o'zidan, zaxira: CDN) ----------
  let pdfjsLoaded = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsLoaded) return pdfjsLoaded;
    const load = (src, worker) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { if (!window.pdfjsLib) return reject(new Error('pdf.js')); window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker; resolve(window.pdfjsLib); };
      s.onerror = () => reject(new Error("PDF o'qish kutubxonasini yuklab bo'lmadi"));
      document.head.appendChild(s);
    });
    pdfjsLoaded = load('/js/vendor/pdf.min.js', '/js/vendor/pdf.worker.min.js')
      .catch(() => load('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'))
      .catch((e) => { pdfjsLoaded = null; throw e; });
    return pdfjsLoaded;
  }

  async function analyzePdf(file) {
    const lib = await loadPdfJs();
    return window.RefsExtract.fromFile(file, lib);
  }

  // Google Scholar talablari bo'yicha PDF tekshiruvi
  function renderPdfCheck(file, info) {
    const list = $('pdfCheckList');
    const items = [];
    const add = (ok, text, level) => items.push({ ok, text, level: ok ? 'ok' : (level || 'bad') });
    const kind = KIND[$('item_type').value] || 'journal';
    const max = kind === 'book' ? 25 * 1048576 : 5000000;
    add(file.size <= 5000000, `Hajmi ${(file.size / 1048576).toFixed(2)} MB${file.size <= 5000000 ? ' (5 MB dan kichik)' : ' — Google Scholar 5 MB dan katta faylni indekslamaydi'}`, file.size <= max ? 'warn' : 'bad');
    if (info) {
      add(info.firstChars > 200, info.firstChars > 200 ? 'Matn qatlami bor (skan emas)' : "Birinchi betda matn deyarli yo'q: PDF skan qilingan bo'lishi mumkin. Asl Word fayldan PDF ga qayta saqlang.");
      const first = fold(info.firstPage);
      const mainLang = $('language').value || 'uz';
      const t = fold($(`title_${mainLang}`).value);
      if (t) {
        const words = t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3);
        const hit = words.filter((w) => first.includes(w)).length;
        add(words.length && hit / words.length >= 0.6, hit / Math.max(1, words.length) >= 0.6 ? 'Sarlavha birinchi betda bor' : "Kiritilgan sarlavha birinchi betda topilmadi. Birinchi bet maqola sarlavhasi bilan boshlanishi kerak (to'plam muqovasi emas).", 'warn');
      }
      const authors = $('authors').value.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
      if (authors.length) {
        const fam = authors.map((n) => fold(nameParts(n).family)).filter(Boolean);
        const okA = fam.every((f) => first.includes(f));
        add(okA, okA ? 'Mualliflar birinchi betda bor' : "Muallif familiyasi birinchi betda topilmadi. Mualliflar sarlavha ostida alohida qatorda bo'lishi kerak.", 'warn');
      }
      add(info.found, info.found ? `Adabiyotlar bo'limi topildi (${info.refs.length} ta manba)` : `PDF oxirida "Foydalanilgan adabiyotlar / References" sarlavhasi topilmadi`, 'warn');
      add(info.pages <= 60 || kind === 'book', `${info.pages} bet${info.pages > 60 && kind !== 'book' ? ': bitta PDF da bitta maqola bo\'lishi kerak, butun to\'plam emas' : ''}`, 'warn');
    }
    list.innerHTML = items.map((i) => `<li class="${i.level}">${esc(i.text)}</li>`).join('');
    $('pdfCheck').hidden = false;
  }

  async function extractRefs(file, { force = false, silent = false } = {}) {
    if (!file) { msg($('refsMsg'), 'Avval PDF faylni tanlang.', 'err'); return null; }
    if (!silent) msg($('refsMsg'), "PDF dan adabiyotlar ro'yxati o'qilmoqda...", 'info');
    try {
      const info = await analyzePdf(file);
      state.pdfInfo = info;
      if (!info.found || !info.refs.length) {
        msg($('refsMsg'), "PDF ichida 'Foydalanilgan adabiyotlar / References / Литература' bo'limi topilmadi. Ro'yxatni qo'lda kiriting.", 'err');
        return info;
      }
      const ta = $('references');
      if (!ta.value.trim() || force) {
        ta.value = info.refs.join('\n');
        ta.dataset.auto = 'yes';
        msg($('refsMsg'), `${info.refs.length} ta manba PDF dan avtomatik olindi. Har birini ko'zdan kechiring.`, 'ok');
      } else {
        msg($('refsMsg'), `PDF da ${info.refs.length} ta manba topildi. Maydondagi ro'yxat o'zgartirilmadi ("PDF dan o'qish" tugmasi bilan almashtirish mumkin).`, 'info');
      }
      return info;
    } catch (e) {
      msg($('refsMsg'), "PDF matnini avtomat o'qishda xatolik: " + e.message, 'err');
      return null;
    }
  }

  // ---------- Ma'lumotlarni yuklash ----------
  async function loadArticles() {
    msg($('listMsg'), 'Yuklanmoqda...', 'info');
    try {
      const data = await api('/api/articles');
      state.articles = Array.isArray(data.articles) ? data.articles : [];
      state.collections = Array.isArray(data.collections) ? data.collections : [];
      state.site = data.site || {};
      state.pages = data.pages || {};
      state.series = Array.isArray(data.series) ? data.series : [];
      state.news = Array.isArray(data.news) ? data.news : [];
      state.profiles = Array.isArray(data.profiles) ? data.profiles : [];
      $('profBadge').textContent = state.profiles.length;
      loadFtIds();
      $('countBadge').textContent = state.articles.length;
      $('collBadge').textContent = state.collections.length;
      $('seriesBadge').textContent = state.series.length;
      $('newsBadge').textContent = state.news.length;
      if (!state.editingId) renderCollectionPanels();
      renderList(); renderColls(); renderPages(); renderSeries(); renderNews(); fillSelects(); renderProfiles();
      msg($('listMsg'), '');
      loadStats();
      return true;
    } catch (e) {
      msg($('listMsg'), 'Xatolik: ' + e.message, 'err');
      msg($('loginMsg'), 'Xatolik: ' + e.message, 'err');
      return false;
    }
  }
  async function loadStats() {
    try { state.stats = (await api('/stats')).stats || {}; renderList(); } catch (_) {}
  }

  function issues(a) {
    const out = [];
    const t = a[`title_${a.language || 'uz'}`] || '';
    if (isCaps(t)) out.push('Sarlavha KATTA HARFDA');
    if (!a.references || !a.references.length) out.push("Adabiyotlar yo'q");
    if (authorWarnings(a.authors || [], a.id).length) out.push('Muallif ismi boshqacha yozilgan');
    const cd = lastDate(a.conference_date);
    if (cd && a.date && cd !== a.date) out.push('Sana konferensiya sanasidan farq qiladi');
    if (a.pdf_size > 5000000) out.push('PDF 5 MB dan katta');
    return out;
  }

  function renderList() {
    const q = fold($('q').value);
    const ul = $('items');
    const filtered = state.articles.filter((a) => {
      if (!q) return true;
      return fold([a.id, a.title_uz, a.title_en, a.title_ru, (a.authors || []).join(' '), a.journal_name, a.conference_org].join(' ')).includes(q);
    });
    if (!filtered.length) { ul.innerHTML = `<li class="item"><span class="item-meta">Nashrlar topilmadi.</span></li>`; return; }
    ul.innerHTML = filtered.map((a) => {
      const t = a.title_uz || a.title_en || a.title_ru || a.id;
      const coll = state.collections.find((c) => c.id === a.collection);
      const s = state.stats[a.id];
      const iss = issues(a);
      return `
        <li class="item">
          <div>
            <p class="item-title"><a class="link" href="/article/${esc(a.id)}/" target="_blank">${esc(t)}</a></p>
            <p class="item-meta">${esc((a.authors || []).join(', '))} • ${esc(a.year)} • ID: <code>${esc(a.id)}</code>${coll ? ` • To'plam: <strong>${esc(coll.name)}</strong>` : ''}</p>
            <p class="item-meta">${s ? `Ko'rishlar: <strong>${s.views}</strong> • Yuklab olishlar: <strong>${s.downloads}</strong>` : "Ko'rishlar: 0 • Yuklab olishlar: 0"}</p>
            <p class="tags">${iss.length ? iss.map((x) => `<span class="tag warn">${esc(x)}</span>`).join('') : '<span class="tag ok">Google Scholar uchun tayyor</span>'}${state.ftIds.has(a.id) ? '<span class="tag ok">To\'liq matn saytda</span>' : (a.pdf ? '<span class="tag">To\'liq matn yo\'q</span>' : '')}</p>
          </div>
          <div class="item-acts">
            <button type="button" class="btn ghost sm" data-edit="${esc(a.id)}">Tahrirlash</button>
            ${a.pdf ? `<button type="button" class="btn ghost sm" data-ft="${esc(a.id)}" title="PDF dan to'liq matnni qayta olish">Matn</button>` : ''}
            <button type="button" class="btn danger sm" data-del="${esc(a.id)}">O'chirish</button>
          </div>
        </li>`;
    }).join('');
    ul.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => startEdit(b.dataset.edit)));
    ul.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => deleteArticle(b.dataset.del)));
    ul.querySelectorAll('[data-ft]').forEach((b) => (b.onclick = async () => {
      b.disabled = true; msg($('listMsg'), "To'liq matn PDF dan olinmoqda...", 'info');
      try { const r = await makeFullText(b.dataset.ft); msg($('listMsg'), `To'liq matn saqlandi (${r.chars} belgi). Maqola sahifasida darhol ko'rinadi.`, 'ok'); }
      catch (e) { msg($('listMsg'), 'Xatolik: ' + e.message, 'err'); }
      finally { b.disabled = false; renderList(); }
    }));
  }

  // ---------- Tahrirlash ----------
  function startEdit(id) {
    const a = state.articles.find((x) => x.id === id);
    if (!a) return;
    state.editingId = a.id;
    state.pdfInfo = null;
    $('editId').textContent = a.id;
    $('editBar').hidden = false;
    $('submitBtn').textContent = "O'zgarishlarni saqlash";
    $('fileLabel').classList.remove('req');
    $('checks').checked = true;
    $('pdfCheck').hidden = true;

    $('item_type').value = a.item_type || 'jurnal-maqolasi';
    $('language').value = a.language || 'uz';
    updateRequiredLangMarkers();
    renderExtraFields();

    $('authors').value = (a.authors || []).join('; ');
    $('author_info').value = (a.authors || []).map((n, i) => { const x = (a.author_info || [])[i] || {}; return x.org || x.orcid ? [x.org || '', x.orcid || ''].join(' | ').replace(/ \| $/, '') : ''; }).join('\n').replace(/\n+$/, '');
    $('section').value = a.section || '';
    $('field').value = a.field || '';
    state.fullText = null; msg($('ftMsg'), state.ftIds.has(a.id) ? "Bu maqolaning to'liq matni saytda bor. Yangi PDF tanlansa, matn ham yangilanadi." : '', 'info');
    $('year').value = a.year || '';
    $('date').value = a.date || '';
    LANGS.forEach(({ code }) => {
      $(`title_${code}`).value = a[`title_${code}`] || '';
      $(`abstract_${code}`).value = a[`abstract_${code}`] || '';
      $(`keywords_${code}`).value = (a[`keywords_${code}`] || []).join(', ');
    });
    refreshCapsHints();
    ['journal_name', 'volume', 'issue', 'pages', 'conference_org', 'conference_place', 'conference_date', 'publisher', 'publisher_city', 'edition', 'total_pages'].forEach((f) => {
      const el = $(`f_${f}`); if (el) el.value = a[f] || '';
    });
    ['doi', 'issn', 'isbn', 'udk', 'bbk'].forEach((f) => { const el = document.querySelector(`[name="${f}"]`); if (el) el.value = a[f] || ''; });
    $('references').value = (a.references || []).join('\n');
    $('references').dataset.auto = '';
    msg($('refsMsg'), '');

    renderCollectionPanels();
    if (a.collection) {
      const coll = state.collections.find((c) => c.id === a.collection);
      const isConf = coll ? coll.type === 'conf' : (a.item_type || '').startsWith('konferensiya');
      const p = isConf ? 'Conf' : 'Journal';
      $(`chk${p}Coll`).checked = true;
      $(`body${p}Coll`).hidden = false;
      $(`sel${p}Coll`).value = coll ? coll.id : '';
      $(`inp${p}Coll`).value = coll ? coll.name : a.collection;
    }
    showAuthorWarn(); checkDates();
    switchView('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditMode() {
    state.editingId = null;
    state.pdfInfo = null;
    $('editBar').hidden = true;
    $('submitBtn').textContent = 'Yuklash';
    $('fileLabel').classList.add('req');
    $('form').reset();
    $('year').value = new Date().getFullYear();
    $('fileInfo').textContent = '';
    $('pdfCheck').hidden = true;
    $('authorHint').hidden = true;
    $('dateHint').hidden = true;
    $('references').dataset.auto = '';
    state.fullText = null; $('pdf_pages').value = ''; msg($('ftMsg'), '');
    msg($('refsMsg'), ''); msg($('msg'), '');
    renderExtraFields(); renderCollectionPanels(); refreshCapsHints();
  }

  async function deleteArticle(id) {
    const a = state.articles.find((x) => x.id === id);
    if (!a) return;
    if (!confirm(`Haqiqatan ham "${a.title_uz || a.title_en || a.title_ru || a.id}" nashrini o'chirmoqchimisiz? PDF arxivga ko'chiriladi.`)) return;
    msg($('listMsg'), "O'chirilmoqda...", 'info');
    try {
      const fd = new FormData();
      fd.append('id', id); fd.append('confirm', id);
      await api('/api/delete', { method: 'POST', body: fd });
      msg($('listMsg'), "Nashr o'chirildi. 1-2 daqiqada saytdan ham olib tashlanadi.", 'ok');
      await loadArticles();
    } catch (e) { msg($('listMsg'), 'Xatolik: ' + e.message, 'err'); }
  }

  // ---------- To'plamlar bo'limi ----------
  const C_FIELDS = ['name', 'type', 'series', 'volume', 'number', 'year', 'date', 'place', 'publisher', 'editor', 'issn', 'isbn', 'description'];
  function renderColls() {
    const ul = $('collItems');
    if (!state.collections.length) { ul.innerHTML = `<li class="item"><span class="item-meta">Hali to'plam yo'q.</span></li>`; return; }
    ul.innerHTML = state.collections.map((c) => {
      const n = state.articles.filter((a) => a.collection === c.id).length;
      return `<li class="item"><div>
          <p class="item-title"><a class="link" href="/collection/${esc(c.id)}/" target="_blank">${esc(c.name)}</a></p>
          <p class="item-meta">${c.type === 'journal' ? 'Jurnal soni' : 'Konferensiya'}${seriesName(c.series) ? ` • <strong>${esc(seriesName(c.series))}</strong>` : ''}${c.volume || c.number ? ` • ${[c.volume && c.volume + '-tom', c.number && c.number + '-son'].filter(Boolean).join(', ')}` : ''} • ${n} ta nashr${c.year ? ' • ' + esc(c.year) : ''} • ID: <code>${esc(c.id)}</code></p></div>
        <div class="item-acts"><button type="button" class="btn ghost sm" data-cedit="${esc(c.id)}">Tahrirlash</button>
        <button type="button" class="btn danger sm" data-cdel="${esc(c.id)}">O'chirish</button></div></li>`;
    }).join('');
    ul.querySelectorAll('[data-cedit]').forEach((b) => (b.onclick = () => openColl(b.dataset.cedit)));
    ul.querySelectorAll('[data-cdel]').forEach((b) => (b.onclick = () => deleteColl(b.dataset.cdel)));
  }
  function openColl(id) {
    const c = id ? state.collections.find((x) => x.id === id) : null;
    state.collEditing = c ? c.id : null;
    $('collFormTitle').textContent = c ? `To'plamni tahrirlash: ${c.name}` : "Yangi to'plam";
    fillSelects();
    C_FIELDS.forEach((f) => { $(`c_${f}`).value = c ? (c[f] || '') : (f === 'type' ? 'conf' : ''); });
    $('c_id').value = c ? c.id : '';
    $('collDelete').hidden = !c;
    $('c_articlesWrap').hidden = !c;
    if (c) {
      $('c_articles').innerHTML = state.articles.map((a) => {
        const other = a.collection && a.collection !== c.id ? state.collections.find((x) => x.id === a.collection) : null;
        return `<label class="check"><input type="checkbox" value="${esc(a.id)}"${a.collection === c.id ? ' checked' : ''}>
          <span>${esc(a.title_uz || a.title_en || a.title_ru || a.id)} <span class="opt">(${esc((a.authors || []).join(', '))}, ${esc(a.year)})${other ? ` • hozir: ${esc(other.name)}` : ''}</span></span></label>`;
      }).join('') || '<p class="hint">Nashrlar yo\'q.</p>';
    }
    msg($('collFormMsg'), '');
    $('collForm').hidden = false;
    $('collForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function deleteColl(id) {
    const c = state.collections.find((x) => x.id === id);
    if (!c) return;
    const n = state.articles.filter((a) => a.collection === id).length;
    if (!confirm(`"${c.name}" to'plamini o'chirasizmi?${n ? `\n\nUndagi ${n} ta maqola saytda qoladi, faqat to'plamdan chiqariladi.` : ''}`)) return;
    msg($('collMsg'), "O'chirilmoqda...", 'info');
    try {
      await postJson('/api/collections', { action: 'delete', id, confirm: id });
      $('collForm').hidden = true;
      msg($('collMsg'), "To'plam o'chirildi. 1-2 daqiqada saytda aks etadi.", 'ok');
      await loadArticles();
    } catch (e) { msg($('collMsg'), 'Xatolik: ' + e.message, 'err'); }
  }
  async function saveColl(e) {
    e.preventDefault();
    const body = { action: 'save', id: state.collEditing || '' };
    C_FIELDS.forEach((f) => { body[f] = $(`c_${f}`).value.trim(); });
    $('collSave').disabled = true;
    msg($('collFormMsg'), 'Saqlanmoqda...', 'info');
    try {
      const r = await postJson('/api/collections', body);
      if (state.collEditing) {
        const picked = [...$('c_articles').querySelectorAll('input:checked')].map((x) => x.value);
        const before = state.articles.filter((a) => a.collection === state.collEditing).map((a) => a.id).sort().join();
        if (picked.slice().sort().join() !== before) await postJson('/api/collections', { action: 'assign', id: state.collEditing, articles: picked });
      }
      msg($('collFormMsg'), "Saqlandi. 1-2 daqiqada saytda aks etadi.", 'ok');
      await loadArticles();
      openColl(r.id);
    } catch (err) { msg($('collFormMsg'), 'Xatolik: ' + err.message, 'err'); }
    finally { $('collSave').disabled = false; }
  }

  // ---------- Jurnal va konferensiyalar (seriyalar) ----------
  const seriesName = (id) => { const x = state.series.find((s) => s.id === id); return x ? x.name : ''; };
  const opt = (v, t, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(t)}</option>`;
  function fillSelects() {
    const sOpts = (sel) => opt('', '— Biriktirilmagan —', sel) + state.series.map((x) => opt(x.id, `${x.type === 'journal' ? 'Jurnal' : 'Konferensiya'}: ${x.name}`, sel)).join('');
    if ($('c_series')) $('c_series').innerHTML = sOpts($('c_series').value);
    if ($('nw_series')) $('nw_series').innerHTML = sOpts($('nw_series').value);
    if ($('nw_collection')) $('nw_collection').innerHTML = opt('', '— Biriktirilmagan —', $('nw_collection').value) + state.collections.map((c) => opt(c.id, c.name, $('nw_collection').value)).join('');
    const secs = [...new Set(state.articles.map((a) => a.section).filter(Boolean))].sort();
    if ($('sectionList')) $('sectionList').innerHTML = secs.map((x) => `<option value="${esc(x)}"></option>`).join('');
    const flds = [...new Set([...FIELDS_DEFAULT, ...state.articles.map((a) => a.field), ...state.series.map((x) => x.field)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz'));
    if ($('fieldList')) $('fieldList').innerHTML = flds.map((x) => `<option value="${esc(x)}"></option>`).join('');
    const orgs = [...new Set([...state.articles.flatMap((a) => (a.author_info || []).map((x) => x && x.org)), ...state.profiles.map((x) => x.org)].filter(Boolean))].sort();
    if ($('orgList')) $('orgList').innerHTML = orgs.map((x) => `<option value="${esc(x)}"></option>`).join('');
  }
  function renderSeries() {
    const ul = $('seriesItems');
    if (!state.series.length) { ul.innerHTML = `<li class="item"><span class="item-meta">Hali jurnal yoki konferensiya qo'shilmagan.</span></li>`; return; }
    ul.innerHTML = state.series.map((x) => {
      const colls = state.collections.filter((c) => c.series === x.id);
      const n = state.articles.filter((a) => colls.some((c) => c.id === a.collection)).length;
      const path = `/${x.type === 'journal' ? 'journal' : 'conference'}/${x.id}/`;
      return `<li class="item"><div><p class="item-title"><a class="link" href="${esc(path)}" target="_blank">${esc(x.name)}</a></p>
        <p class="item-meta">${x.type === 'journal' ? 'Jurnal' : 'Konferensiya'}${x.issn ? ' • ISSN ' + esc(x.issn) : ''}${x.eissn ? ' • eISSN ' + esc(x.eissn) : ''} • ${colls.length} ta son • ${n} ta maqola • ID: <code>${esc(x.id)}</code></p></div>
        <div class="item-acts"><button type="button" class="btn ghost sm" data-sedit="${esc(x.id)}">Tahrirlash</button></div></li>`;
    }).join('');
    ul.querySelectorAll('[data-sedit]').forEach((b) => (b.onclick = () => openSeries(b.dataset.sedit)));
  }
  const SR_TEXT = ['type', 'short', 'name', 'issn', 'eissn', 'founded', 'frequency', 'languages', 'scope', 'field', 'publisher', 'email', 'address'];
  function openSeries(id) {
    const x = id ? state.series.find((s) => s.id === id) : null;
    state.seriesEditing = x ? x.id : null;
    $('seriesFormTitle').textContent = x ? `Tahrirlash: ${x.name}` : "Yangi jurnal yoki konferensiya";
    SR_TEXT.forEach((f) => { $(`sr_${f}`).value = x ? (x[f] || '') : (f === 'type' ? 'journal' : ''); });
    ['description', 'guidelines', 'ethics'].forEach((f) => { $(`sr_${f}`).value = x ? (x[f] || []).join('\n\n') : ''; });
    $('sr_editors').value = x ? (x.editors || []).map((m) => [m.name, m.role, m.org, m.degree, m.orcid].map((v) => v || '').join(' | ').replace(/( \| )+$/, '')).join('\n') : '';
    $('sr_indexing').value = x ? (x.indexing || []).map((m) => [m.name, m.url].filter(Boolean).join(' | ')).join('\n') : '';
    $('seriesDelete').hidden = !x;
    msg($('seriesFormMsg'), '');
    $('seriesForm').hidden = false;
    $('seriesForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function saveSeries(e) {
    e.preventDefault();
    const body = { action: 'save', id: state.seriesEditing || '' };
    SR_TEXT.forEach((f) => { body[f] = $(`sr_${f}`).value.trim(); });
    ['description', 'guidelines', 'ethics'].forEach((f) => { body[f] = $(`sr_${f}`).value; });
    const cells = (t) => t.split('|').map((v) => v.trim());
    body.editors = $('sr_editors').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, role, org, degree, orcid] = cells(l); return { name, role, org, degree, orcid }; });
    body.indexing = $('sr_indexing').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [name, url] = cells(l); return { name, url }; });
    $('seriesSave').disabled = true;
    msg($('seriesFormMsg'), 'Saqlanmoqda...', 'info');
    try {
      const r = await postJson('/api/series', body);
      msg($('seriesFormMsg'), 'Saqlandi. 1-2 daqiqada saytda aks etadi.', 'ok');
      await loadArticles();
      openSeries(r.id);
    } catch (err) { msg($('seriesFormMsg'), 'Xatolik: ' + err.message, 'err'); }
    finally { $('seriesSave').disabled = false; }
  }
  async function deleteSeries(id) {
    const x = state.series.find((s) => s.id === id);
    if (!x) return;
    const n = state.collections.filter((c) => c.series === id).length;
    if (!confirm(`"${x.name}" ni o'chirasizmi?${n ? `\n\nUnga biriktirilgan ${n} ta son saytda qoladi, faqat biriktirilmagan holga o'tadi.` : ''}`)) return;
    try {
      await postJson('/api/series', { action: 'delete', id, confirm: id });
      $('seriesForm').hidden = true;
      msg($('seriesMsg'), "O'chirildi. 1-2 daqiqada saytda aks etadi.", 'ok');
      await loadArticles();
    } catch (err) { msg($('seriesMsg'), 'Xatolik: ' + err.message, 'err'); }
  }

  // ---------- E'lonlar ----------
  const NW_FIELDS = ['kind', 'title', 'date', 'deadline', 'event_date', 'place', 'series', 'collection', 'link', 'link_text'];
  function renderNews() {
    const ul = $('newsItems'), today = new Date().toISOString().slice(0, 10);
    if (!state.news.length) { ul.innerHTML = `<li class="item"><span class="item-meta">Hali e'lon yo'q.</span></li>`; return; }
    ul.innerHTML = state.news.map((n) => `<li class="item"><div><p class="item-title"><a class="link" href="/news/${esc(n.id)}/" target="_blank">${esc(n.title)}</a></p>
      <p class="item-meta">${esc(n.date || '')}${n.kind === 'cfp' ? ' • Maqolalar qabuli' : ' • Yangilik'}${n.deadline ? ` • muddat: ${esc(n.deadline)}` : ''}</p>
      ${n.deadline ? `<p class="tags"><span class="tag ${n.deadline >= today ? 'ok' : 'warn'}">${n.deadline >= today ? 'Qabul ochiq' : 'Muddat o\'tgan'}</span></p>` : ''}</div>
      <div class="item-acts"><button type="button" class="btn ghost sm" data-nedit="${esc(n.id)}">Tahrirlash</button></div></li>`).join('');
    ul.querySelectorAll('[data-nedit]').forEach((b) => (b.onclick = () => openNews(b.dataset.nedit)));
  }
  function openNews(id) {
    const n = id ? state.news.find((x) => x.id === id) : null;
    state.newsEditing = n ? n.id : null;
    fillSelects();
    $('newsFormTitle').textContent = n ? `Tahrirlash: ${n.title}` : "Yangi e'lon";
    NW_FIELDS.forEach((f) => { $(`nw_${f}`).value = n ? (n[f] || '') : (f === 'kind' ? 'cfp' : f === 'date' ? new Date().toISOString().slice(0, 10) : ''); });
    $('nw_text').value = n ? (n.text || []).join('\n\n') : '';
    $('newsDelete').hidden = !n;
    msg($('newsFormMsg'), '');
    $('newsForm').hidden = false;
    $('newsForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function saveNews(e) {
    e.preventDefault();
    const body = { action: 'save', id: state.newsEditing || '', text: $('nw_text').value };
    NW_FIELDS.forEach((f) => { body[f] = $(`nw_${f}`).value.trim(); });
    $('newsSave').disabled = true;
    msg($('newsFormMsg'), 'Saqlanmoqda...', 'info');
    try {
      const r = await postJson('/api/news', body);
      msg($('newsFormMsg'), 'Saqlandi. 1-2 daqiqada saytda aks etadi.', 'ok');
      await loadArticles();
      openNews(r.id);
    } catch (err) { msg($('newsFormMsg'), 'Xatolik: ' + err.message, 'err'); }
    finally { $('newsSave').disabled = false; }
  }
  async function deleteNews(id) {
    const n = state.news.find((x) => x.id === id);
    if (!n || !confirm(`"${n.title}" e'lonini o'chirasizmi?`)) return;
    try {
      await postJson('/api/news', { action: 'delete', id, confirm: id });
      $('newsForm').hidden = true;
      msg($('newsMsg'), "E'lon o'chirildi.", 'ok');
      await loadArticles();
    } catch (err) { msg($('newsMsg'), 'Xatolik: ' + err.message, 'err'); }
  }

  // ---------- To'liq matn (PDF dan HTML ga) ----------
  async function loadFtIds() {
    try { const d = await api('/api/fulltext'); state.ftIds = new Set(d.ids || []); renderList(); } catch (_) {}
  }
  async function extractFullText(file) {
    const lib = await loadPdfJs();
    return window.FullText.fromFile(file, lib);
  }
  async function saveFullText(id, ft) {
    if (!ft || !ft.blocks || !ft.blocks.length) throw new Error("PDF dan matn olinmadi");
    const r = await postJson('/api/fulltext', { id, blocks: ft.blocks });
    state.ftIds.add(id);
    return r;
  }
  async function pdfFileOf(a) {
    const r = await fetch(`/pdf/${encodeURIComponent(a.pdf)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('PDF ni yuklab bo\'lmadi');
    return new File([await r.blob()], a.pdf, { type: 'application/pdf' });
  }
  async function makeFullText(id) {
    const a = state.articles.find((x) => x.id === id);
    if (!a || !a.pdf) throw new Error("Maqolaning PDF fayli yo'q");
    return saveFullText(id, await extractFullText(await pdfFileOf(a)));
  }
  async function makeAllFullTexts() {
    const todo = state.articles.filter((a) => a.pdf && !state.ftIds.has(a.id));
    if (!todo.length) { msg($('listMsg'), "Barcha maqolalarning to'liq matni saytda bor.", 'ok'); return; }
    if (!confirm(`${todo.length} ta maqola uchun PDF dan to'liq matn olinadi va maqola sahifalariga qo'yiladi. Davom etilsinmi?`)) return;
    $('ftAllBtn').disabled = true;
    let ok = 0, bad = 0;
    for (const [i, a] of todo.entries()) {
      msg($('listMsg'), `To'liq matn: ${i + 1} / ${todo.length} — ${a.title_uz || a.title_en || a.title_ru || a.id}`, 'info');
      try { await makeFullText(a.id); ok++; } catch (e) { bad++; console.warn(a.id, e); }
    }
    $('ftAllBtn').disabled = false;
    renderList();
    msg($('listMsg'), `Tayyor: ${ok} ta maqolaning to'liq matni saqlandi${bad ? `, ${bad} tasida xatolik (PDF skan qilingan bo'lishi mumkin)` : ''}.`, bad ? 'err' : 'ok');
  }

  // ---------- Muallif profillari ----------
  function authorNames() {
    const seen = {}, out = [];
    state.articles.forEach((a) => (a.authors || []).forEach((n) => { const k = fold(scholarName(n)); if (!seen[k]) { seen[k] = 1; out.push(n); } }));
    return out.sort((x, y) => x.localeCompare(y, 'uz'));
  }
  const profileOf = (n) => state.profiles.find((p) => fold(scholarName(p.name)) === fold(scholarName(n)) || sameGroup(p.name, n));
  function renderProfiles() {
    const q = fold($('profQ').value), ul = $('profItems');
    const names = authorNames().filter((n) => !q || fold(n).includes(q));
    ul.innerHTML = names.map((n) => {
      const p = profileOf(n), cnt = state.articles.filter((a) => (a.authors || []).some((x) => fold(scholarName(x)) === fold(scholarName(n)))).length;
      return `<li class="item"><div><p class="item-title">${esc(n)}</p><p class="item-meta">${cnt} ta nashr${p && p.org ? ' • ' + esc(p.org) : ''}</p>
        <p class="tags">${p ? '<span class="tag ok">Profil bor</span>' : '<span class="tag">Profil yo\'q</span>'}</p></div>
        <div class="item-acts"><button type="button" class="btn ghost sm" data-pedit="${esc(n)}">${p ? 'Tahrirlash' : "Profil qo'shish"}</button></div></li>`;
    }).join('') || `<li class="item"><span class="item-meta">Muallif topilmadi.</span></li>`;
    ul.querySelectorAll('[data-pedit]').forEach((b) => (b.onclick = () => openProfile(b.dataset.pedit)));
  }
  const PF = ['name', 'degree', 'position', 'org', 'orcid', 'scholar', 'researchgate', 'website'];
  function openProfile(n) {
    const p = profileOf(n) || {};
    state.profEditing = p.name || null;
    fillSelects();
    $('profFormTitle').textContent = `Muallif profili: ${n}`;
    PF.forEach((f) => { $(`pf_${f}`).value = f === 'name' ? (p.name || n) : (p[f] || ''); });
    if (!p.org) { const a = state.articles.find((x) => (x.authors || []).some((y, i) => fold(scholarName(y)) === fold(scholarName(n)) && x.author_info && x.author_info[i] && x.author_info[i].org)); if (a) { const i = a.authors.findIndex((y) => fold(scholarName(y)) === fold(scholarName(n))); $('pf_org').value = a.author_info[i].org; } }
    $('pf_bio').value = (p.bio || []).join('\n\n');
    $('pf_interests').value = (p.interests || []).join(', ');
    $('profDelete').hidden = !p.name;
    msg($('profFormMsg'), '');
    $('profForm').hidden = false;
    $('profForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function saveProfile(e) {
    e.preventDefault();
    const body = { action: 'save', old_name: state.profEditing || '', bio: $('pf_bio').value, interests: $('pf_interests').value };
    PF.forEach((f) => { body[f] = $(`pf_${f}`).value.trim(); });
    $('profSave').disabled = true; msg($('profFormMsg'), 'Saqlanmoqda...', 'info');
    try { await postJson('/api/profiles', body); msg($('profFormMsg'), 'Saqlandi. 1-2 daqiqada muallif sahifasida aks etadi.', 'ok'); state.profEditing = body.name; await loadArticles(); }
    catch (err) { msg($('profFormMsg'), 'Xatolik: ' + err.message, 'err'); }
    finally { $('profSave').disabled = false; }
  }
  async function deleteProfile() {
    if (!state.profEditing || !confirm(`"${state.profEditing}" profilini o'chirasizmi? Muallifning maqolalari saytda qoladi.`)) return;
    try { await postJson('/api/profiles', { action: 'delete', name: state.profEditing }); $('profForm').hidden = true; msg($('profMsg'), "Profil o'chirildi.", 'ok'); await loadArticles(); }
    catch (err) { msg($('profMsg'), 'Xatolik: ' + err.message, 'err'); }
  }

  // ---------- Sahifalar bo'limi ----------
  function pageBlock(k, p) {
    return `<div class="pageblock" data-key="${esc(k)}">
      <div class="between"><span class="lbl">${esc(PAGE_NAMES[k] || p.title || k)} <span class="opt">/${esc(k)}/</span></span>
      ${['about', 'contact'].includes(k) ? '' : `<button type="button" class="btn danger sm" data-premove="${esc(k)}">O'chirish</button>`}</div>
      <label class="field"><span class="hint">Sarlavha</span><input data-ptitle maxlength="120" value="${esc(p.title || '')}"></label>
      <label class="field"><span class="hint">Matn</span><textarea data-ptext rows="5">${esc((p.text || []).join('\n\n'))}</textarea></label>
    </div>`;
  }
  // ---------- Muallif ismlarini birlashtirish ----------
  function groupBlock(g) {
    return `<div class="pageblock" data-group>
      <div class="between"><span class="lbl">Muallif</span><button type="button" class="btn danger sm" data-gremove>O'chirish</button></div>
      <label class="field"><span class="hint">Asosiy ism (sahifada shu ko'rinadi)</span><input data-gname maxlength="200" value="${esc(g.name || '')}" placeholder="Ikromov, Muhammadyusuf Tursunali o'g'li"></label>
      <label class="field"><span class="hint">Boshqa yozilishlari (har biri yangi qatorda)</span><textarea data-gvars rows="2" placeholder="Ikromov, Maxamadyusub Tursunali o'g'li">${esc((g.variants || []).join('\n'))}</textarea></label>
      <label class="check"><input type="checkbox" data-gshow${g.show_variants ? ' checked' : ''}> Boshqa yozilishlarni muallif sahifasida ko'rsatish</label>
    </div>`;
  }
  function bindGroupRemove() {
    $('groupsBox').querySelectorAll('[data-gremove]').forEach((b) => (b.onclick = () => b.closest('[data-group]').remove()));
  }
  function renderGroups() {
    $('groupsBox').innerHTML = (state.site.author_groups || []).map(groupBlock).join('');
    bindGroupRemove();
  }
  function readGroups() {
    return [...$('groupsBox').querySelectorAll('[data-group]')].map((el) => ({
      name: el.querySelector('[data-gname]').value.trim(),
      variants: el.querySelector('[data-gvars]').value.split(/[;\n]+/).map((x) => x.trim()).filter(Boolean),
      show_variants: el.querySelector('[data-gshow]').checked,
    })).filter((g) => g.name || g.variants.length);
  }
  // Birlashtirilgan ismlar (ogohlantirishda hisobga olinadi)
  function sameGroup(a, b) {
    const fa = fold(scholarName(a)), fb = fold(scholarName(b));
    return (state.site.author_groups || []).some((g) => {
      const all = [g.name, ...(g.variants || [])].map((x) => fold(scholarName(x)));
      return all.includes(fa) && all.includes(fb);
    });
  }

  let removedPages = [];
  function renderPages() {
    renderGroups();
    $('s_name').value = state.site.name || '';
    $('s_publisher').value = state.site.publisher || '';
    $('s_description').value = state.site.description || '';
    $('s_email').value = state.site.email || '';
    removedPages = [];
    const order = ['about', 'editorial-board', 'ethics', 'contact'];
    const keys = Object.keys(state.pages).sort((x, y) => ((order.indexOf(x) + 1) || 99) - ((order.indexOf(y) + 1) || 99));
    $('pagesBox').innerHTML = keys.map((k) => pageBlock(k, state.pages[k])).join('');
    bindPageRemove();
  }
  function bindPageRemove() {
    $('pagesBox').querySelectorAll('[data-premove]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.premove;
      if (!confirm(`"/${k}/" sahifasini o'chirasizmi?`)) return;
      removedPages.push(k);
      b.closest('.pageblock').remove();
    }));
  }
  async function saveSite(e) {
    e.preventDefault();
    const pages = {};
    $('pagesBox').querySelectorAll('.pageblock').forEach((el) => {
      pages[el.dataset.key] = { title: el.querySelector('[data-ptitle]').value.trim(), text: el.querySelector('[data-ptext]').value };
    });
    $('siteSave').disabled = true;
    msg($('siteMsg'), 'Saqlanmoqda...', 'info');
    try {
      await postJson('/api/site', {
        site: { name: $('s_name').value, publisher: $('s_publisher').value, description: $('s_description').value, email: $('s_email').value, author_groups: readGroups() },
        pages, remove: removedPages,
      });
      msg($('siteMsg'), 'Saqlandi. 1-2 daqiqada saytda aks etadi.', 'ok');
      await loadArticles();
    } catch (err) { msg($('siteMsg'), 'Xatolik: ' + err.message, 'err'); }
    finally { $('siteSave').disabled = false; }
  }

  // ---------- Umumiy ----------
  const VIEWS = { form: ['viewForm', 'navForm'], list: ['viewList', 'navList'], series: ['viewSeries', 'navSeries'], coll: ['viewColl', 'navColl'], news: ['viewNews', 'navNews'], prof: ['viewProf', 'navProf'], pages: ['viewPages', 'navPages'] };
  function switchView(v) {
    Object.entries(VIEWS).forEach(([k, [sec, nav]]) => {
      $(sec).hidden = k !== v;
      $(nav).setAttribute('aria-selected', k === v ? 'true' : 'false');
    });
  }
  function doLogout(reason = '') {
    setToken('');
    clearTimeout(idleTimer);
    $('panel').hidden = true;
    $('logoutBtn').hidden = true;
    $('loginCard').hidden = false;
    if (reason) msg($('loginMsg'), reason, 'err');
  }
  function showAuthorWarn() {
    const list = $('authors').value.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
    const w = authorWarnings(list, state.editingId);
    $('authorHint').textContent = w.join(' ');
    $('authorHint').hidden = !w.length;
  }

  // Formaga qo'shimcha ogohlantirish joylari
  (function addHints() {
    const a = document.createElement('span');
    a.className = 'hint warn'; a.id = 'authorHint'; a.hidden = true;
    $('authors').closest('.field').appendChild(a);
    const d = document.createElement('span');
    d.className = 'hint warn'; d.id = 'dateHint'; d.hidden = true;
    $('date').closest('.field').appendChild(d);
  })();

  initLangTabs();
  renderExtraFields();
  $('year').value = new Date().getFullYear();

  $('language').onchange = updateRequiredLangMarkers;
  $('item_type').onchange = () => { renderExtraFields(); checkDates(); };
  $('authors').addEventListener('blur', showAuthorWarn);
  $('date').addEventListener('change', () => { if ($('date').value) $('year').value = $('date').value.slice(0, 4); checkDates(); });
  $('year').addEventListener('change', checkDates);
  $('navForm').onclick = () => switchView('form');
  $('navList').onclick = () => { switchView('list'); loadArticles(); };
  $('navColl').onclick = () => switchView('coll');
  $('navSeries').onclick = () => switchView('series');
  $('navNews').onclick = () => switchView('news');
  $('navProf').onclick = () => switchView('prof');
  $('profQ').oninput = renderProfiles;
  $('profForm').onsubmit = saveProfile;
  $('profCancel').onclick = () => { $('profForm').hidden = true; };
  $('profDelete').onclick = deleteProfile;
  $('ftAllBtn').onclick = makeAllFullTexts;
  $('newSeriesBtn').onclick = () => openSeries(null);
  $('seriesCancel').onclick = () => { $('seriesForm').hidden = true; };
  $('seriesDelete').onclick = () => state.seriesEditing && deleteSeries(state.seriesEditing);
  $('seriesForm').onsubmit = saveSeries;
  $('newNewsBtn').onclick = () => openNews(null);
  $('newsCancel').onclick = () => { $('newsForm').hidden = true; };
  $('newsDelete').onclick = () => state.newsEditing && deleteNews(state.newsEditing);
  $('newsForm').onsubmit = saveNews;
  $('authors').addEventListener('input', () => { const n = $('authors').value.split(/[;\n]+/).filter((x) => x.trim()).length; $('author_info').rows = Math.min(Math.max(2, n), 8); });
  $('navPages').onclick = () => switchView('pages');
  $('reloadBtn').onclick = loadArticles;
  $('q').oninput = renderList;
  $('cancelEdit').onclick = cancelEditMode;
  $('newCollBtn').onclick = () => openColl(null);
  $('collCancel').onclick = () => { $('collForm').hidden = true; };
  $('collDelete').onclick = () => state.collEditing && deleteColl(state.collEditing);
  $('collForm').onsubmit = saveColl;
  $('siteForm').onsubmit = saveSite;
  $('g_add').onclick = () => {
    $('groupsBox').insertAdjacentHTML('beforeend', groupBlock({ name: '', variants: [], show_variants: false }));
    bindGroupRemove();
  };
  $('np_add').onclick = () => {
    const k = $('np_key').value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    const t = $('np_title').value.trim();
    if (!k || k.length < 2 || !t) { msg($('siteMsg'), "Yangi sahifa uchun manzil va sarlavhani kiriting.", 'err'); return; }
    if ($('pagesBox').querySelector(`[data-key="${k}"]`)) { msg($('siteMsg'), 'Bunday sahifa bor.', 'err'); return; }
    $('pagesBox').insertAdjacentHTML('beforeend', pageBlock(k, { title: t, text: [] }));
    bindPageRemove();
    $('np_key').value = ''; $('np_title').value = '';
    msg($('siteMsg'), "Sahifa qo'shildi. Matnini yozib, \"Saqlash\" ni bosing.", 'info');
  };

  $('pwToggle').onclick = () => {
    const inp = $('token');
    const isPw = inp.type === 'password';
    inp.type = isPw ? 'text' : 'password';
    $('pwToggle').textContent = isPw ? 'Yashirish' : "Ko'rsatish";
  };

  $('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const t = $('token').value.trim();
    if (!t) return;
    $('loginBtn').disabled = true;
    msg($('loginMsg'), 'Tekshirilmoqda...', 'info');
    setToken(t);
    const ok = await loadArticles();
    $('loginBtn').disabled = false;
    if (ok) {
      $('token').value = '';
      msg($('loginMsg'), '');
      $('loginCard').hidden = true;
      $('panel').hidden = false;
      $('logoutBtn').hidden = false;
      resetIdle();
    }
  };
  $('logoutBtn').onclick = () => doLogout();

  $('file').onchange = async function () {
    const f = this.files[0];
    state.pdfInfo = null;
    if (!f) { $('fileInfo').textContent = ''; $('pdfCheck').hidden = true; return; }
    $('fileInfo').textContent = `${f.name} (${(f.size / 1048576).toFixed(2)} MB)`;
    renderPdfCheck(f, null);
    const info = await extractRefs(f);
    renderPdfCheck(f, info);
    if (info && info.firstChars > 200) $('checks').checked = true;
    $('pdf_pages').value = info && info.pages ? info.pages : '';
    state.fullText = null;
    msg($('ftMsg'), "To'liq matn PDF dan olinmoqda...", 'info');
    try {
      state.fullText = await extractFullText(f);
      msg($('ftMsg'), state.fullText.chars > 300 ? `To'liq matn olindi: ${state.fullText.blocks.length} ta xatboshi, ${state.fullText.chars} belgi. Saqlangandan keyin maqola sahifasida chiqadi.` : "PDF da matn deyarli yo'q (skan bo'lishi mumkin): to'liq matn sahifaga qo'yilmaydi.", state.fullText.chars > 300 ? 'ok' : 'err');
    } catch (e) { msg($('ftMsg'), "To'liq matnni olishda xatolik: " + e.message, 'err'); }
  };
  $('refsBtn').onclick = async () => {
    let f = $('file').files[0];
    if (!f && state.editingId) f = await fetchCurrentPdf();
    if (!f) { msg($('refsMsg'), 'Avval PDF faylni tanlang.', 'err'); return; }
    if ($('references').value.trim() && !confirm("Maydondagi ro'yxat PDF dan o'qilgan ro'yxat bilan almashtirilsinmi?")) return;
    extractRefs(f, { force: true });
  };

  // Tahrirlashda yangi PDF tanlanmagan bo'lsa, saytdagi PDF ni olish
  async function fetchCurrentPdf() {
    const a = state.articles.find((x) => x.id === state.editingId);
    if (!a || !a.pdf) return null;
    try {
      const r = await fetch(`/pdf/${encodeURIComponent(a.pdf)}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const b = await r.blob();
      return new File([b], a.pdf, { type: 'application/pdf' });
    } catch (_) { return null; }
  }

  $('form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('submitBtn');
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      // Adabiyotlar bo'sh bo'lsa: PDF oxiridagi ro'yxatdan avtomatik shakllantiriladi
      if (!$('references').value.trim()) {
        let f = $('file').files[0];
        if (!f && state.editingId) { msg($('msg'), "Adabiyotlar saytdagi PDF dan o'qilmoqda...", 'info'); f = await fetchCurrentPdf(); }
        if (f) {
          msg($('msg'), "Adabiyotlar ro'yxati PDF dan shakllantirilmoqda...", 'info');
          await extractRefs(f, { silent: true });
        }
      }
      const fd = new FormData($('form'));
      if (state.editingId) fd.set('edit_id', state.editingId);
      if ($('references').dataset.auto === 'yes') fd.set('references_auto', 'yes');
      const collData = getSelectedCollectionData();
      if (collData && (collData.id || collData.name)) {
        fd.set('collection_id', collData.id);
        fd.set('collection_name', collData.name);
        fd.set('collection_type', collData.type);
      }
      $('bar').style.display = 'block';
      $('fill').style.width = '40%';
      msg($('msg'), state.editingId ? "O'zgarishlar saqlanmoqda..." : 'Nashr yuklanmoqda...', 'info');
      const data = await api('/api/upload', { method: 'POST', body: fd });
      $('fill').style.width = '80%';
      let ftNote = '';
      if (state.fullText && state.fullText.chars > 300 && data.id) {
        try { await saveFullText(data.id, state.fullText); ftNote = " To'liq matn ham saqlandi."; }
        catch (e) { ftNote = " To'liq matnni saqlab bo'lmadi: " + e.message + ' ("Nashrlar" bo\'limidagi "Matn" tugmasi bilan qayta urinib ko\'ring).'; }
      }
      $('fill').style.width = '100%';
      const refsN = $('references').value.split('\n').filter((s) => s.trim()).length;
      msg($('msg'), (state.editingId ? 'Maqola yangilandi!' : 'Maqola joylandi!') + ` ${refsN ? refsN + " ta adabiyot saqlandi. " : ''}1-2 daqiqada saytda aks etadi.` + ftNote + (data.scholar_pdf === false ? ' Diqqat: PDF 5 MB dan katta, Google Scholar uni indekslamaydi.' : ''), 'ok');
      const keep = $('msg').textContent;
      cancelEditMode();
      msg($('msg'), keep, 'ok');
      await loadArticles();
    } catch (err) {
      msg($('msg'), 'Xatolik: ' + err.message, 'err');
    } finally {
      btn.disabled = false;
      setTimeout(() => { $('bar').style.display = 'none'; $('fill').style.width = '0'; }, 600);
    }
  };

  if (getToken()) {
    $('loginCard').hidden = true;
    $('panel').hidden = false;
    $('logoutBtn').hidden = false;
    loadArticles();
    resetIdle();
  }
})();
