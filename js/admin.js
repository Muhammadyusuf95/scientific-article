(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'admin_token_v3';
  const IDLE_MS = 20 * 60 * 1000;
  let idleTimer = null;
  const state = { articles: [], collections: [], site: {}, pages: {}, stats: {}, editingId: null, collEditing: null, pdfInfo: null };

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
  const PATRONYM = /^(?:o['ʻʼ‘’`´]?g['ʻʼ‘’`´]?li|ogli|ugli|qizi|kizi|kyzy|ўғли|қизи|оглы|кызы|угли)$/i;

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
      const diff = [...known[f]].filter((k) => fold(scholarName(k)) !== fold(scholarName(n)));
      if (diff.length) out.push(`"${n}" boshqa nashrlarda ${diff.map((k) => `"${k}"`).join(', ')} deb yozilgan. Bir odam bo'lsa, hamma joyda bir xil yozing: Google Scholar turlicha yozilgan ismlarni turli muallif deb hisoblaydi.`);
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
    $('selJournalColl').onchange = function () { const o = this.options[this.selectedIndex]; $('inpJournalColl').value = o && o.dataset.name ? o.dataset.name : ''; };
    $('selConfColl').onchange = function () { const o = this.options[this.selectedIndex]; $('inpConfColl').value = o && o.dataset.name ? o.dataset.name : ''; };
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
      $('countBadge').textContent = state.articles.length;
      $('collBadge').textContent = state.collections.length;
      if (!state.editingId) renderCollectionPanels();
      renderList(); renderColls(); renderPages();
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
            ${iss.length ? `<p class="tags">${iss.map((x) => `<span class="tag warn">${esc(x)}</span>`).join('')}</p>` : '<p class="tags"><span class="tag ok">Google Scholar uchun tayyor</span></p>'}
          </div>
          <div class="item-acts">
            <button type="button" class="btn ghost sm" data-edit="${esc(a.id)}">Tahrirlash</button>
            <button type="button" class="btn danger sm" data-del="${esc(a.id)}">O'chirish</button>
          </div>
        </li>`;
    }).join('');
    ul.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => startEdit(b.dataset.edit)));
    ul.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => deleteArticle(b.dataset.del)));
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
  const C_FIELDS = ['name', 'type', 'year', 'date', 'place', 'publisher', 'editor', 'issn', 'isbn', 'description'];
  function renderColls() {
    const ul = $('collItems');
    if (!state.collections.length) { ul.innerHTML = `<li class="item"><span class="item-meta">Hali to'plam yo'q.</span></li>`; return; }
    ul.innerHTML = state.collections.map((c) => {
      const n = state.articles.filter((a) => a.collection === c.id).length;
      return `<li class="item"><div>
          <p class="item-title"><a class="link" href="/collection/${esc(c.id)}/" target="_blank">${esc(c.name)}</a></p>
          <p class="item-meta">${c.type === 'journal' ? 'Jurnal soni' : 'Konferensiya'} • ${n} ta nashr${c.year ? ' • ' + esc(c.year) : ''} • ID: <code>${esc(c.id)}</code></p></div>
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

  // ---------- Sahifalar bo'limi ----------
  function pageBlock(k, p) {
    return `<div class="pageblock" data-key="${esc(k)}">
      <div class="between"><span class="lbl">${esc(PAGE_NAMES[k] || p.title || k)} <span class="opt">/${esc(k)}/</span></span>
      ${['about', 'contact'].includes(k) ? '' : `<button type="button" class="btn danger sm" data-premove="${esc(k)}">O'chirish</button>`}</div>
      <label class="field"><span class="hint">Sarlavha</span><input data-ptitle maxlength="120" value="${esc(p.title || '')}"></label>
      <label class="field"><span class="hint">Matn</span><textarea data-ptext rows="5">${esc((p.text || []).join('\n\n'))}</textarea></label>
    </div>`;
  }
  let removedPages = [];
  function renderPages() {
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
        site: { name: $('s_name').value, publisher: $('s_publisher').value, description: $('s_description').value, email: $('s_email').value },
        pages, remove: removedPages,
      });
      msg($('siteMsg'), 'Saqlandi. 1-2 daqiqada saytda aks etadi.', 'ok');
      await loadArticles();
    } catch (err) { msg($('siteMsg'), 'Xatolik: ' + err.message, 'err'); }
    finally { $('siteSave').disabled = false; }
  }

  // ---------- Umumiy ----------
  const VIEWS = { form: ['viewForm', 'navForm'], list: ['viewList', 'navList'], coll: ['viewColl', 'navColl'], pages: ['viewPages', 'navPages'] };
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
  $('navPages').onclick = () => switchView('pages');
  $('reloadBtn').onclick = loadArticles;
  $('q').oninput = renderList;
  $('cancelEdit').onclick = cancelEditMode;
  $('newCollBtn').onclick = () => openColl(null);
  $('collCancel').onclick = () => { $('collForm').hidden = true; };
  $('collDelete').onclick = () => state.collEditing && deleteColl(state.collEditing);
  $('collForm').onsubmit = saveColl;
  $('siteForm').onsubmit = saveSite;
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
      $('fill').style.width = '100%';
      const refsN = $('references').value.split('\n').filter((s) => s.trim()).length;
      msg($('msg'), (state.editingId ? 'Maqola yangilandi!' : 'Maqola joylandi!') + ` ${refsN ? refsN + " ta adabiyot saqlandi. " : ''}1-2 daqiqada saytda aks etadi.` + (data.scholar_pdf === false ? ' Diqqat: PDF 5 MB dan katta, Google Scholar uni indekslamaydi.' : ''), 'ok');
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
