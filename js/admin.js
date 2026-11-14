(function () {
  const $ = (id) => document.getElementById(id);
  const KEY = 'admin_token_v3';
  const IDLE_MS = 20 * 60 * 1000;
  let idleTimer = null;
  let state = { articles: [], collections: [], editingId: null };

  const LANGS = [
    { code: 'uz', label: "O'zbekcha" },
    { code: 'en', label: 'Inglizcha' },
    { code: 'ru', label: 'Ruscha' },
  ];

  const KIND = {
    'jurnal-maqolasi': 'journal',
    'konferensiya-maqolasi': 'conf',
    'konferensiya-tezisi': 'conf',
    'darslik': 'book',
    'oquv-qollanma': 'book',
    'monografiya': 'book',
  };

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

  let activeLang = 'uz';
  function initLangTabs() {
    const tabs = $('tabs');
    const panels = $('langPanels');
    tabs.innerHTML = '';
    panels.innerHTML = '';
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
        <label class="field">
          <span class="lbl" id="lbl_title_${code}">Sarlavha (${label})</span>
          <input type="text" name="title_${code}" id="title_${code}" maxlength="300">
        </label>
        <label class="field">
          <span class="lbl" id="lbl_abs_${code}">Annotatsiya (${label})</span>
          <textarea name="abstract_${code}" id="abstract_${code}" rows="4" maxlength="6000"></textarea>
        </label>
        <label class="field">
          <span class="lbl" id="lbl_kw_${code}">Kalit so'zlar (${label})</span>
          <input type="text" name="keywords_${code}" id="keywords_${code}" placeholder="kalit so'z 1, kalit so'z 2">
          <span class="hint">Vergul yoki nuqtali vergul bilan ajrating.</span>
        </label>
      `;
      panels.appendChild(p);
    });
    updateRequiredLangMarkers();
  }

  function updateRequiredLangMarkers() {
    const main = $('language').value || 'uz';
    LANGS.forEach(({ code }) => {
      ['title', 'abs', 'kw'].forEach((k) => {
        const el = $(`lbl_${k}_${code}`);
        if (el) el.classList.toggle('req', code === main);
      });
    });
  }

  function renderCollectionPanels() {
    const box = $('collPanels');
    const jColls = state.collections.filter((c) => c.type !== 'conf');
    const cColls = state.collections.filter((c) => c.type !== 'journal');

    box.innerHTML = `
      <div class="coll-group">
        <label class="check" style="margin-top:0">
          <input type="checkbox" id="chkJournalColl">
          <span><strong>Jurnal to'plami</strong> (jurnal sonidagi maqolalarni to'plam sifatida birlashtirish)</span>
        </label>
        <div class="coll-body" id="bodyJournalColl" hidden>
          <div class="grid">
            <label class="field">
              <span class="lbl">Mavjud jurnal to'plamini tanlash</span>
              <select id="selJournalColl">
                <option value="">— Yangi to'plam nomini qo'lda yozish —</option>
                ${jColls.map((c) => `<option value="${esc(c.id)}" data-name="${esc(c.name)}">${esc(c.name)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="lbl">To'plam yoki jurnal soni nomi (qo'lda yozish)</span>
              <input type="text" id="inpJournalColl" maxlength="200" placeholder="Masalan: O'zbekiston ilmiy jurnali — 2026, 2-son">
            </label>
          </div>
        </div>
      </div>

      <div class="coll-group">
        <label class="check" style="margin-top:0">
          <input type="checkbox" id="chkConfColl">
          <span><strong>Konferensiya to'plami</strong> (konferensiya materiallarini to'plam sifatida birlashtirish)</span>
        </label>
        <div class="coll-body" id="bodyConfColl" hidden>
          <div class="grid">
            <label class="field">
              <span class="lbl">Mavjud konferensiya to'plamini tanlash</span>
              <select id="selConfColl">
                <option value="">— Yangi to'plam nomini qo'lda yozish —</option>
                ${cColls.map((c) => `<option value="${esc(c.id)}" data-name="${esc(c.name)}">${esc(c.name)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="lbl">Konferensiya to'plami nomi (qo'lda yozish)</span>
              <input type="text" id="inpConfColl" maxlength="200" placeholder="Masalan: Filologiyaning dolzarb masalalari — 2026">
            </label>
          </div>
        </div>
      </div>
    `;

    const chkJ = $('chkJournalColl'), chkC = $('chkConfColl');
    const bodyJ = $('bodyJournalColl'), bodyC = $('bodyConfColl');
    const selJ = $('selJournalColl'), inpJ = $('inpJournalColl');
    const selC = $('selConfColl'), inpC = $('inpConfColl');

    chkJ.onchange = () => {
      if (chkJ.checked) chkC.checked = false;
      bodyJ.hidden = !chkJ.checked;
      bodyC.hidden = !chkC.checked;
    };
    chkC.onchange = () => {
      if (chkC.checked) chkJ.checked = false;
      bodyC.hidden = !chkC.checked;
      bodyJ.hidden = !chkJ.checked;
    };
    selJ.onchange = () => {
      const opt = selJ.options[selJ.selectedIndex];
      if (opt && opt.dataset.name) inpJ.value = opt.dataset.name;
    };
    selC.onchange = () => {
      const opt = selC.options[selC.selectedIndex];
      if (opt && opt.dataset.name) inpC.value = opt.dataset.name;
    };
  }

  function getSelectedCollectionData() {
    if ($('chkJournalColl')?.checked) {
      return { id: $('selJournalColl').value.trim(), name: $('inpJournalColl').value.trim(), type: 'journal' };
    }
    if ($('chkConfColl')?.checked) {
      return { id: $('selConfColl').value.trim(), name: $('inpConfColl').value.trim(), type: 'conf' };
    }
    return null;
  }

  function renderExtraFields() {
    const type = $('item_type').value;
    const kind = KIND[type] || 'journal';
    const extra = $('extra');
    if (kind === 'journal') {
      extra.innerHTML = `
        <label class="field full"><span class="lbl req">Jurnal nomi</span><input name="journal_name" id="f_journal_name" maxlength="200" required></label>
        <label class="field"><span class="lbl">Tom (Volume)</span><input name="volume" id="f_volume" maxlength="40"></label>
        <label class="field"><span class="lbl">Son (Issue)</span><input name="issue" id="f_issue" maxlength="40"></label>
        <label class="field"><span class="lbl">Betlar</span><input name="pages" id="f_pages" placeholder="10-18" maxlength="40"></label>
      `;
    } else if (kind === 'conf') {
      extra.innerHTML = `
        <label class="field full"><span class="lbl req">Konferensiya nomi</span><input name="conference_org" id="f_conference_org" maxlength="200" required></label>
        <label class="field"><span class="lbl">O'tkazilgan joyi</span><input name="conference_place" id="f_conference_place" maxlength="120"></label>
        <label class="field"><span class="lbl">Konferensiya sanasi</span><input name="conference_date" id="f_conference_date" maxlength="60" placeholder="14.10.2026"></label>
        <label class="field"><span class="lbl">Betlar</span><input name="pages" id="f_pages" placeholder="405-409" maxlength="40"></label>
      `;
    } else {
      extra.innerHTML = `
        <label class="field full"><span class="lbl">Nashriyot</span><input name="publisher" id="f_publisher" maxlength="200"></label>
        <label class="field"><span class="lbl">Nashr shahri</span><input name="publisher_city" id="f_publisher_city" maxlength="100"></label>
        <label class="field"><span class="lbl">Nashr (Edition)</span><input name="edition" id="f_edition" maxlength="60"></label>
        <label class="field"><span class="lbl">Umumiy betlar soni</span><input name="total_pages" id="f_total_pages" maxlength="40"></label>
      `;
    }
    const maxMb = kind === 'book' ? 25 : 5;
    $('sizeHint').textContent = `Maksimal hajm: ${maxMb} MB (Google Scholar indeksatsiyasi uchun 5 MB gacha tavsiya etiladi).`;
  }

  let pdfjsLoaded = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsLoaded) return pdfjsLoaded;
    pdfjsLoaded = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error("PDF o'qish kutubxonasini yuklab bo'lmadi"));
      document.head.appendChild(s);
    });
    return pdfjsLoaded;
  }

  async function extractRefsFromPdfFile(file) {
    if (!file) { msg($('refsMsg'), 'Avval PDF faylni tanlang.', 'err'); return; }
    msg($('refsMsg'), "PDF ichidan foydalanilgan adabiyotlar ro'yxati o'qilmoqda...", 'info');
    try {
      const pdfjsLib = await loadPdfJs();
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let fullText = '';
      const startPage = Math.max(1, pdf.numPages - 6);
      for (let p = startPage; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        let lastY = null, pageLines = [];
        for (const item of content.items) {
          const y = Math.round(item.transform[5]);
          if (lastY !== null && Math.abs(y - lastY) > 4) pageLines.push('\n');
          else if (lastY !== null) pageLines.push(' ');
          pageLines.push(item.str);
          lastY = y;
        }
        fullText += pageLines.join('') + '\n';
      }

      const headingRe = /(?:^|\n)\s*(?:foydalanilgan\s+adabiyotlar(?:\s+ro['ʻʼ’`]?yxati)?|adabiyotlar(?:\s+ro['ʻʼ’`]?yxati)?|references|bibliography|список\s+(?:использованной\s+)?литературы|литература)\s*:?\s*(?:\n|$)/gi;
      let match, lastIdx = -1;
      while ((match = headingRe.exec(fullText)) !== null) {
        lastIdx = match.index + match[0].length;
      }

      if (lastIdx === -1) {
        msg($('refsMsg'), "PDF ichidan 'Adabiyotlar / References / Литература' sarlavhasi topilmadi. Qo'lda kiritishingiz mumkin.", 'err');
        return;
      }

      const tail = fullText.slice(lastIdx).trim();
      const rawLines = tail.split(/\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const items = [];
      const numStart = /^(?:\[\d+\]|\d+[\.\)])\s+/;

      for (const line of rawLines) {
        if (/^(?:muallif\s+haqida|information\s+about|сведения\s+об\s+автор|qabul\s+qilindi|received)/i.test(line)) break;
        if (numStart.test(line)) {
          items.push(line.replace(numStart, '').trim());
        } else if (items.length > 0) {
          items[items.length - 1] += ' ' + line;
        } else {
          items.push(line);
        }
      }

      const cleaned = items.map((s) => s.trim()).filter((s) => s.length > 8);
      if (!cleaned.length) {
        msg($('refsMsg'), "Adabiyotlar bo'limi bo'sh ko'rinmoqda. Qo'lda tekshiring.", 'err');
        return;
      }
      $('references').value = cleaned.join('\n');
      msg($('refsMsg'), `${cleaned.length} ta manba avtomat ajratib olindi!`, 'ok');
    } catch (e) {
      msg($('refsMsg'), "PDF matnini avtomat o'qishda xatolik: " + e.message, 'err');
    }
  }

  async function loadArticles() {
    msg($('listMsg'), 'Yuklanmoqda...', 'info');
    try {
      const res = await fetch('/api/articles', { headers: { 'X-Admin-Token': getToken() } });
      if (res.status === 401 || res.status === 403) {
        doLogout("Admin kaliti noto'g'ri yoki muddati tugagan.");
        return false;
      }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Xatolik');
      state.articles = Array.isArray(data.articles) ? data.articles : [];
      state.collections = Array.isArray(data.collections) ? data.collections : [];
      $('countBadge').textContent = state.articles.length;
      renderCollectionPanels();
      renderList();
      msg($('listMsg'), '');
      return true;
    } catch (e) {
      msg($('listMsg'), 'Xatolik: ' + e.message, 'err');
      return false;
    }
  }

  function renderList() {
    const q = ($('q').value || '').trim().toLowerCase();
    const ul = $('items');
    const filtered = state.articles.filter((a) => {
      if (!q) return true;
      const hay = [a.id, a.title_uz, a.title_en, a.title_ru, (a.authors || []).join(' '), a.journal_name, a.conference_org].join(' ').toLowerCase();
      return hay.includes(q);
    });

    if (!filtered.length) {
      ul.innerHTML = `<li class="item"><span class="item-meta">Nashrlar topilmadi.</span></li>`;
      return;
    }

    ul.innerHTML = filtered.map((a) => {
      const t = a.title_uz || a.title_en || a.title_ru || a.id;
      const coll = state.collections.find((c) => c.id === a.collection);
      return `
        <li class="item">
          <div>
            <p class="item-title"><a class="link" href="/article/${esc(a.id)}/" target="_blank">${esc(t)}</a></p>
            <p class="item-meta">${esc((a.authors || []).join(', '))} • ${esc(a.year)} • ID: <code>${esc(a.id)}</code>${coll ? ` • To'plam: <strong>${esc(coll.name)}</strong>` : ''}</p>
          </div>
          <div class="item-acts">
            <button type="button" class="btn ghost sm" data-edit="${esc(a.id)}">Tahrirlash</button>
            <button type="button" class="btn danger sm" data-del="${esc(a.id)}">O'chirish</button>
          </div>
        </li>
      `;
    }).join('');

    ul.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => startEdit(b.dataset.edit)));
    ul.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => deleteArticle(b.dataset.del)));
  }

  function startEdit(id) {
    const a = state.articles.find((x) => x.id === id);
    if (!a) return;
    state.editingId = a.id;
    $('editId').textContent = a.id;
    $('editBar').hidden = false;
    $('submitBtn').textContent = "O'zgarishlarni saqlash";
    $('fileLabel').classList.remove('req');
    $('checks').checked = true;

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

    ['journal_name', 'volume', 'issue', 'pages', 'conference_org', 'conference_place', 'conference_date', 'publisher', 'publisher_city', 'edition', 'total_pages'].forEach((f) => {
      const el = $(`f_${f}`);
      if (el) el.value = a[f] || '';
    });

    ['doi', 'issn', 'isbn', 'udk', 'bbk'].forEach((f) => {
      const el = document.querySelector(`[name="${f}"]`);
      if (el) el.value = a[f] || '';
    });

    $('references').value = (a.references || []).join('\n');

    renderCollectionPanels();
    if (a.collection) {
      const coll = state.collections.find((c) => c.id === a.collection);
      const isConf = (a.item_type || '').startsWith('konferensiya') || coll?.type === 'conf';
      if (isConf) {
        $('chkConfColl').checked = true;
        $('bodyConfColl').hidden = false;
        $('selConfColl').value = coll ? coll.id : '';
        $('inpConfColl').value = coll ? coll.name : a.collection;
      } else {
        $('chkJournalColl').checked = true;
        $('bodyJournalColl').hidden = false;
        $('selJournalColl').value = coll ? coll.id : '';
        $('inpJournalColl').value = coll ? coll.name : a.collection;
      }
    }

    switchView('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditMode() {
    state.editingId = null;
    $('editBar').hidden = true;
    $('submitBtn').textContent = 'Yuklash';
    $('fileLabel').classList.add('req');
    $('form').reset();
    $('year').value = new Date().getFullYear();
    $('fileInfo').textContent = '';
    msg($('refsMsg'), '');
    msg($('msg'), '');
    renderExtraFields();
    renderCollectionPanels();
  }

  // Sizning delete.js faylingizga (form.get('id') va form.get('confirm')) 100% mos!
  async function deleteArticle(id) {
    const a = state.articles.find((x) => x.id === id);
    if (!a) return;
    if (!confirm(`Haqiqatan ham "${a.title_uz || a.id}" nashrini o'chirmoqchimisiz?`)) return;
    msg($('listMsg'), "O'chirilmoqda...", 'info');
    try {
      const fd = new FormData();
      fd.append('id', id);
      fd.append('confirm', id);
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'X-Admin-Token': getToken() },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "O'chirishda xatolik");
      msg($('listMsg'), "Nashr muvaffaqiyatli o'chirildi!", 'ok');
      await loadArticles();
    } catch (e) {
      msg($('listMsg'), 'Xatolik: ' + e.message, 'err');
    }
  }

  function switchView(v) {
    const isForm = v === 'form';
    $('viewForm').hidden = !isForm;
    $('viewList').hidden = isForm;
    $('navForm').setAttribute('aria-selected', isForm ? 'true' : 'false');
    $('navList').setAttribute('aria-selected', isForm ? 'false' : 'true');
  }

  function doLogout(reason = '') {
    setToken('');
    clearTimeout(idleTimer);
    $('panel').hidden = true;
    $('logoutBtn').hidden = true;
    $('loginCard').hidden = false;
    if (reason) msg($('loginMsg'), reason, 'err');
  }

  initLangTabs();
  renderExtraFields();
  $('year').value = new Date().getFullYear();

  $('language').onchange = updateRequiredLangMarkers;
  $('item_type').onchange = renderExtraFields;
  $('navForm').onclick = () => switchView('form');
  $('navList').onclick = () => { switchView('list'); loadArticles(); };
  $('reloadBtn').onclick = loadArticles;
  $('q').oninput = renderList;
  $('cancelEdit').onclick = cancelEditMode;

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

  $('file').onchange = function () {
    const f = this.files[0];
    if (!f) { $('fileInfo').textContent = ''; return; }
    $('fileInfo').textContent = `${f.name} (${(f.size / 1048576).toFixed(2)} MB)`;
    extractRefsFromPdfFile(f);
  };
  $('refsBtn').onclick = () => extractRefsFromPdfFile($('file').files[0]);

  $('form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('submitBtn');
    if (btn.disabled) return;

    const fd = new FormData($('form'));
    if (state.editingId) fd.set('edit_id', state.editingId);

    const collData = getSelectedCollectionData();
    if (collData && (collData.id || collData.name)) {
      fd.set('collection_id', collData.id);
      fd.set('collection_name', collData.name);
      fd.set('collection_type', collData.type);
    }

    btn.disabled = true;
    $('bar').style.display = 'block';
    $('fill').style.width = '40%';
    msg($('msg'), state.editingId ? "O'zgarishlar saqlanmoqda..." : 'Nashr yuklanmoqda...', 'info');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'X-Admin-Token': getToken() },
        body: fd,
      });
      $('fill').style.width = '100%';
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Saqlashda xatolik');

      msg($('msg'), state.editingId ? "Maqola muvaffaqiyatli yangilandi! 1-2 daqiqada saytda aks etadi." : "Maqola muvaffaqiyatli joylandi! 1-2 daqiqada saytda aks etadi.", 'ok');
      cancelEditMode();
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
