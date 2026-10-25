/* CRC Worship v3 - dashboard (one session per date) */
(async () => {
  if (!CRC.guard()) return;
  const $ = (id) => document.getElementById(id);
  const date = new URLSearchParams(location.search).get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return location.replace('calendar.html');

  const BOOKS = { GEN:'Genesis',EXO:'Exodus',LEV:'Leviticus',NUM:'Numbers',DEU:'Deuteronomy',JOS:'Joshua',JDG:'Judges',RUT:'Ruth','1SA':'1 Samuel','2SA':'2 Samuel','1KI':'1 Kings','2KI':'2 Kings','1CH':'1 Chronicles','2CH':'2 Chronicles',EZR:'Ezra',NEH:'Nehemiah',EST:'Esther',JOB:'Job',PSA:'Psalms',PRO:'Proverbs',ECC:'Ecclesiastes',SNG:'Song of Solomon',ISA:'Isaiah',JER:'Jeremiah',LAM:'Lamentations',EZK:'Ezekiel',DAN:'Daniel',HOS:'Hosea',JOL:'Joel',AMO:'Amos',OBA:'Obadiah',JON:'Jonah',MIC:'Micah',NAM:'Nahum',HAB:'Habakkuk',ZEP:'Zephaniah',HAG:'Haggai',ZEC:'Zechariah',MAL:'Malachi',MAT:'Matthew',MRK:'Mark',LUK:'Luke',JHN:'John',ACT:'Acts',ROM:'Romans','1CO':'1 Corinthians','2CO':'2 Corinthians',GAL:'Galatians',EPH:'Ephesians',PHP:'Philippians',COL:'Colossians','1TH':'1 Thessalonians','2TH':'2 Thessalonians','1TI':'1 Timothy','2TI':'2 Timothy',TIT:'Titus',PHM:'Philemon',HEB:'Hebrews',JAS:'James','1PE':'1 Peter','2PE':'2 Peter','1JN':'1 John','2JN':'2 John','3JN':'3 John',JUD:'Jude',REV:'Revelation' };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
  const toast = (m) => { const t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 2600); };

  // ---------- state ----------
  const d = new Date(date + 'T00:00:00');
  $('dt').textContent = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let S, settings, sel = null, live = null, tab = 'songs';
  const bc = new BroadcastChannel('crc-live');
  const cache = { img: new Map(), media: new Map() };
  let lastPayload = { screen: null, settings: CRC.DEFAULTS };

  try {
    const { session } = await CRC.api('/api/sessions?date=' + date);
    S = session || { date, title: d.toLocaleDateString('en-US', { weekday: 'long' }) + ' Service', items: [], settings: null };
  } catch (e) { S = { date, title: '', items: [], settings: null }; $('st').textContent = 'Offline'; $('st').className = 'chip err'; toast(e.message); }
  let remembered = null; try { remembered = JSON.parse(localStorage.getItem('crc_last_settings')); } catch {}
  settings = CRC.loadSettings(S.settings || remembered);
  $('title').value = S.title || '';
  sel = S.items[0]?.id || null;

  // ---------- saving ----------
  let timer;
  function dirty() {
    $('st').textContent = 'Saving…'; $('st').className = 'chip';
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        S.settings = settings; S.title = $('title').value;
        localStorage.setItem('crc_last_settings', JSON.stringify(settings));
        await CRC.api('/api/sessions', { method: 'PUT', body: { date, title: S.title, items: S.items, settings } });
        $('st').textContent = 'Saved ✓'; $('st').className = 'chip ok';
      } catch (e) { $('st').textContent = 'Not saved'; $('st').className = 'chip err'; toast(e.message); }
    }, 700);
  }
  $('title').addEventListener('input', dirty);
  if (!S.items.length && !S.settings) { $('st').textContent = 'New session'; }
  else if (S.settings || S.items.length) { $('st').textContent = 'Saved ✓'; $('st').className = 'chip ok'; }

  // ---------- assets ----------
  async function getImage(id) {
    if (!cache.img.has(id)) cache.img.set(id, CRC.api('/api/library?type=images&id=' + encodeURIComponent(id)).then((r) => r.image.imageData).catch(() => ''));
    return cache.img.get(id);
  }
  async function getMedia(id) {
    if (!cache.media.has(id)) cache.media.set(id, CRC.api('/api/media?id=' + id).then((r) => r.dataUrl).catch(() => ''));
    return cache.media.get(id);
  }
  async function payloadFor(screen) {
    const p = { screen, settings };
    if (settings.bg.type === 'media') p.bgSrc = await getMedia(settings.bg.value);
    if (screen && screen.kind === 'image') p.imgSrc = await getImage(screen.imageId);
    return p;
  }

  // ---------- screens + live ----------
  const screensOf = (it) => CRC.itemScreens(it, settings.lines);
  const flat = () => S.items.flatMap((it) => screensOf(it).map((_, i) => ({ itemId: it.id, idx: i })));

  async function pushLive() {
    const it = live && S.items.find((x) => x.id === live.itemId);
    const screen = it ? screensOf(it)[live.idx] || null : null;
    lastPayload = await payloadFor(screen);
    CRC.renderScreen($('pv'), lastPayload);
    bc.postMessage({ t: 'show', payload: lastPayload });
    document.querySelectorAll('.thumb').forEach((el) => el.classList.toggle('live', !!live && el.dataset.i == live.idx && sel === live.itemId));
  }
  bc.onmessage = (e) => { if (e.data && e.data.t === 'hello') bc.postMessage({ t: 'show', payload: lastPayload }); };

  function go(offset) {
    const f = flat(); if (!f.length) return;
    let i = live ? f.findIndex((x) => x.itemId === live.itemId && x.idx === live.idx) : -1;
    i = Math.min(f.length - 1, Math.max(0, i + offset));
    live = f[i]; sel = live.itemId; renderItems(); renderScreens(); pushLive();
  }

  // ---------- order of service ----------
  const ICON = { song: '♪', image: '🖼', bible: '✝' };
  function renderItems() {
    const box = $('items');
    if (!S.items.length) { box.innerHTML = '<div class="empty">Nothing planned for this day yet.<br>Search a song, image or verse on the left and press <b>+ Add</b>.</div>'; return; }
    box.innerHTML = S.items.map((it, i) => `
      <div class="row click${it.id === sel ? ' sel' : ''}" data-id="${it.id}">
        <span class="ico">${ICON[it.type] || '•'}</span>
        <div class="t"><b>${CRC.esc(it.title)}</b><small>${it.type}${it.singer ? ' · ' + CRC.esc(it.singer) : ''}</small></div>
        <button class="btn sm ghost" data-a="up" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn sm ghost" data-a="dn" ${i === S.items.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="btn sm ghost danger" data-a="rm">✕</button>
      </div>`).join('');
  }
  $('items').addEventListener('click', (e) => {
    const row = e.target.closest('.row'); if (!row) return;
    const id = row.dataset.id, i = S.items.findIndex((x) => x.id === id), a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'up' && i > 0) [S.items[i - 1], S.items[i]] = [S.items[i], S.items[i - 1]];
    else if (a === 'dn' && i < S.items.length - 1) [S.items[i + 1], S.items[i]] = [S.items[i], S.items[i + 1]];
    else if (a === 'rm') { S.items.splice(i, 1); if (sel === id) sel = S.items[0]?.id || null; if (live?.itemId === id) { live = null; pushLive(); } }
    else if (!a) sel = id;
    if (a) dirty();
    renderItems(); renderScreens();
  });

  function renderScreens() {
    const it = S.items.find((x) => x.id === sel), box = $('screens');
    $('scrTitle').textContent = it ? `Screens · ${it.title}` : 'Screens';
    if (!it) { box.innerHTML = ''; $('scrHint').textContent = ''; return; }
    const list = screensOf(it);
    $('scrHint').textContent = `${list.length} screen${list.length === 1 ? '' : 's'} · click to show live · ← → to step`;
    box.innerHTML = list.map((s, i) => `<div class="thumb" data-i="${i}"><div class="stage"></div><span class="lb">${CRC.esc(s.label || i + 1)}</span></div>`).join('');
    box.querySelectorAll('.thumb').forEach(async (el, i) => {
      CRC.renderScreen(el.firstElementChild, await payloadFor(list[i]));
    });
    if (live && live.itemId === sel) box.querySelector(`.thumb[data-i="${live.idx}"]`)?.classList.add('live');
  }
  $('screens').addEventListener('click', (e) => {
    const t = e.target.closest('.thumb'); if (!t) return;
    live = { itemId: sel, idx: +t.dataset.i }; pushLive();
  });

  function addItem(item) { S.items.push({ id: uid(), ...item }); sel = S.items[S.items.length - 1].id; dirty(); renderItems(); renderScreens(); toast('Added to ' + (S.title || 'this day')); }

  // ---------- library ----------
  let qTimer;
  function renderLib() {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'bible') return renderBible();
    $('lib').innerHTML = `<input class="input" id="q" placeholder="Search ${tab}…" style="margin-bottom:10px"><div class="list" id="res"><div class="empty">Loading…</div></div><p class="hint" id="resH"></p>`;
    $('q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(search, 300); });
    search();
  }
  async function search() {
    const q = $('q').value, mine = tab;
    try {
      const r = await CRC.api(`/api/library?type=${tab}&q=${encodeURIComponent(q)}`);
      if (mine !== tab) return;
      window.__res = r.items;
      $('res').innerHTML = r.items.length ? r.items.map((x, i) => `
        <div class="row"><span class="ico">${tab === 'songs' ? '♪' : '🖼'}</span>
          <div class="t"><b>${CRC.esc(x.title)}</b><small>${CRC.esc(x.singer || x.category || '')}</small></div>
          <button class="btn sm pri" data-i="${i}">+ Add</button></div>`).join('') : '<div class="empty">No matches.</div>';
      $('resH').textContent = r.total > r.items.length ? `Showing ${r.items.length} of ${r.total} — type to narrow down.` : `${r.total} found.`;
    } catch (e) { $('res').innerHTML = `<div class="empty">${CRC.esc(e.message)}</div>`; }
  }
  $('lib').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const x = window.__res[+b.dataset.i];
    if (tab === 'songs') addItem({ type: 'song', title: x.title, singer: x.singer, sections: x.sections });
    else addItem({ type: 'image', title: x.title, imageId: x.id });
  });
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; renderLib(); } });

  // ---------- bible ----------
  let bible = null;
  async function renderBible() {
    $('lib').innerHTML = '<div class="empty">Loading Bible…</div>';
    if (!bible) {
      try {
        const [cfg, en, ta] = await Promise.all(['bible-config', 'english', 'tamil'].map((f) => fetch(`bible/data/${f}.json`).then((r) => r.json())));
        const map = {};
        Object.keys(en).forEach((k) => { const [b, c, v] = k.split('.'); ((map[b] ||= {})[c] ||= 0); map[b][c] = Math.max(map[b][c], +v); });
        bible = { order: cfg.bookOrder.filter((b) => map[b]), en, ta, map };
      } catch (e) { $('lib').innerHTML = '<div class="empty">Bible data could not be loaded.</div>'; return; }
    }
    const opts = (arr, fmt = (x) => x) => arr.map((x) => `<option value="${x}">${CRC.esc(fmt(x))}</option>`).join('');
    $('lib').innerHTML = `
      <div class="biblerow" style="grid-template-columns:1fr"><select class="sel2" id="bk">${opts(bible.order, (c) => BOOKS[c] || c)}</select></div>
      <div class="biblerow"><select class="sel2" id="ch"></select><span></span></div>
      <div class="biblerow"><select class="sel2" id="v1"></select><select class="sel2" id="v2"></select></div>
      <button class="btn pri" style="width:100%" id="addv">+ Add passage</button>
      <p class="hint">English is the main text; Tamil shows at half the size. Long verses shrink automatically to fit the screen.</p>`;
    const fill = () => {
      const b = $('bk').value, chs = Object.keys(bible.map[b]).map(Number).sort((a, c) => a - c);
      $('ch').innerHTML = opts(chs, (c) => 'Chapter ' + c);
      fillV();
    };
    const fillV = () => {
      const max = bible.map[$('bk').value][$('ch').value], vs = Array.from({ length: max }, (_, i) => i + 1);
      $('v1').innerHTML = opts(vs, (v) => 'From verse ' + v); $('v2').innerHTML = opts(vs, (v) => 'To verse ' + v);
    };
    $('bk').onchange = fill; $('ch').onchange = fillV; $('v1').onchange = () => { if (+$('v2').value < +$('v1').value) $('v2').value = $('v1').value; };
    fill();
    $('v2').value = $('v1').value;
    $('addv').onclick = () => {
      const code = $('bk').value, c = $('ch').value, a = +$('v1').value, z = Math.max(a, +$('v2').value);
      if (z - a > 60) return toast('Pick at most 60 verses at a time');
      const verses = [];
      for (let v = a; v <= z; v++) verses.push({ ref: `${BOOKS[code] || code} ${c}:${v}`, en: bible.en[`${code}.${c}.${v}`] || '', ta: bible.ta[`${code}.${c}.${v}`] || '' });
      addItem({ type: 'bible', title: `${BOOKS[code] || code} ${c}:${a}${z > a ? '–' + z : ''}`, verses });
    };
  }

  // ---------- control panel ----------
  const pick = (id, attr, val) => document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset[attr] == val));
  $('lines').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button data-v="${n}">${n}</button>`).join('');
  const tc = CRC.rgbPicker($('tc'), settings.textColor, (h) => change({ textColor: h }));
  const bgc = CRC.rgbPicker($('bgc'), settings.bg.type === 'color' ? settings.bg.value : '#000000', (h) => change({ bg: { type: 'color', value: h } }));

  function syncPanel() {
    pick('fmt', 'v', settings.format); pick('lines', 'v', settings.lines);
    $('font').value = settings.font; $('size').value = settings.fontSize; $('dim').value = settings.dim;
    $('sizeO').textContent = settings.fontSize; $('dimO').textContent = settings.dim + '%';
    $('sizeH').textContent = `English ${settings.fontSize} · Tamil ${Math.round(settings.fontSize * CRC.TAMIL_RATIO)} (always 50%)`;
    tc.set(settings.textColor); if (settings.bg.type === 'color') bgc.set(settings.bg.value);
  }
  function change(patch) {
    settings = { ...settings, ...patch };
    syncPanel(); dirty();
    if (patch.lines !== undefined && live) { const n = screensOf(S.items.find((x) => x.id === live.itemId) || { }).length; live.idx = Math.min(live.idx, Math.max(0, n - 1)); }
    renderScreens(); pushLive();
  }
  $('fmt').onclick = (e) => { const b = e.target.closest('button'); if (b) change({ format: b.dataset.v }); };
  $('lines').onclick = (e) => { const b = e.target.closest('button'); if (b) change({ lines: +b.dataset.v }); };
  $('font').onchange = (e) => change({ font: e.target.value });
  $('size').oninput = (e) => change({ fontSize: +e.target.value });
  $('dim').oninput = (e) => change({ dim: +e.target.value });
  $('prev').onclick = () => go(-1); $('next').onclick = () => go(1);
  $('black').onclick = () => { live = null; pushLive(); renderScreens(); };
  $('openScreen').onclick = () => window.open('screen.html', 'crcScreen', 'popup,width=1280,height=720');
  $('out').onclick = CRC.logout;
  addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); }
    else if (e.key.toLowerCase() === 'b' || e.key === 'Escape') $('black').click();
  });

  // ---------- media library (backgrounds) ----------
  let mtab = 'tpl';
  const modal = $('mm');
  $('browse').onclick = () => { modal.classList.add('open'); drawMedia(); };
  $('mclose').onclick = () => modal.classList.remove('open');
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
  $('mtabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; mtab = b.dataset.t; document.querySelectorAll('#mtabs button').forEach((x) => x.classList.toggle('on', x === b)); drawMedia(); };

  async function drawMedia() {
    const body = $('mbody');
    if (mtab === 'tpl') {
      body.innerHTML = '<div class="tiles">' + CRC.TEMPLATES.map((t) => `<div class="tile${settings.bg.type === 'template' && settings.bg.value === t.id ? ' on' : ''}" data-tpl="${t.id}" style="background:${t.css}"><span>${t.name}</span></div>`).join('') + '</div>';
      return;
    }
    body.innerHTML = '<div class="bar"><label class="btn sm pri" for="upl">+ Upload image</label><input id="upl" type="file" accept="image/jpeg,image/png,image/webp" hidden><span class="muted">JPEG, PNG or WebP · resized automatically</span></div><div id="ups" class="tiles"><div class="empty">Loading…</div></div>';
    $('upl').onchange = upload;
    try {
      const r = await CRC.api('/api/media');
      $('ups').innerHTML = r.items.length ? r.items.map((m) => `<div class="tile${settings.bg.type === 'media' && settings.bg.value === m.id ? ' on' : ''}" data-media="${m.id}" style="background-image:url('${m.thumb}')"><span>${CRC.esc(m.title)}</span><span class="x" data-del="${m.id}">✕</span></div>`).join('') : '<div class="empty" style="grid-column:1/-1">No uploads yet.</div>';
    } catch (e) { $('ups').innerHTML = `<div class="empty">${CRC.esc(e.message)}</div>`; }
  }
  $('mbody').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { if (confirm('Delete this upload?')) { await CRC.api('/api/media?id=' + del.dataset.del, { method: 'DELETE' }); drawMedia(); } return; }
    const t = e.target.closest('.tile'); if (!t) return;
    if (t.dataset.tpl) change({ bg: { type: 'template', value: t.dataset.tpl } });
    else if (t.dataset.media) change({ bg: { type: 'media', value: t.dataset.media } });
    modal.classList.remove('open');
  });

  function shrink(img, maxW, q) {
    const c = document.createElement('canvas'), k = Math.min(1, maxW / img.width);
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  async function upload(e) {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(); img.src = URL.createObjectURL(f);
    try {
      await img.decode();
      let w = 1920, q = 0.85, data = shrink(img, w, q);
      while (data.length > 2_300_000 && w > 640) { w *= 0.8; q = 0.78; data = shrink(img, w, q); }
      await CRC.api('/api/media', { method: 'POST', body: { title: f.name.replace(/\.[^.]+$/, ''), dataUrl: data, thumb: shrink(img, 320, 0.7) } });
      toast('Uploaded'); drawMedia();
    } catch (x) { toast(x.message || 'Upload failed'); }
  }

  // ---------- go ----------
  syncPanel(); renderLib(); renderItems(); renderScreens(); pushLive();
  document.fonts.ready.then(() => { renderScreens(); pushLive(); });
})();
