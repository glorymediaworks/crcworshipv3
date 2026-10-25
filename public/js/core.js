/* CRC Worship v3 - shared core: API, auth, parsing, screen rendering */
window.CRC = (() => {
  const API = window.CRC_API_BASE || '';
  const TA = /[\u0B80-\u0BFF]/;
  const TAMIL_RATIO = 0.5; // RULE: Tamil / any non-English language = 50% of English size, everywhere (see css .ta/.th)

  // ---------- auth + api ----------
  const getToken = () => localStorage.getItem('crc_token') || '';
  const setToken = (t) => localStorage.setItem('crc_token', t);
  function logout() { localStorage.removeItem('crc_token'); location.href = 'index.html'; }
  function guard() { if (!getToken()) { location.replace('index.html'); return false; } return true; }

  async function api(path, { method = 'GET', body, noRedirect } = {}) {
    const r = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !noRedirect) { logout(); throw new Error('Signed out'); }
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  // ---------- settings ----------
  const DEFAULTS = {
    format: 'both',          // tamil | thanglish | english | both (= every language present)
    lines: 2,                // lyric lines per screen (1-8)
    font: 'Noto Sans Tamil',
    fontSize: 64,            // ENGLISH size at 1080p; Tamil is always 50% of this
    textColor: '#ffffff',
    bg: { type: 'color', value: '#000000' },
    dim: 0
  };
  const loadSettings = (s) => ({ ...DEFAULTS, ...(s || {}), bg: { ...DEFAULTS.bg, ...((s && s.bg) || {}) } });

  const TEMPLATES = [
    { id: 'midnight', name: 'Midnight', css: 'linear-gradient(160deg,#0b1020,#1f3366)' },
    { id: 'ember', name: 'Ember', css: 'linear-gradient(160deg,#1a0805,#8a3210)' },
    { id: 'dawn', name: 'Dawn', css: 'linear-gradient(180deg,#26124a,#c4532d 85%,#f4a259)' },
    { id: 'forest', name: 'Forest', css: 'linear-gradient(160deg,#04140e,#17543a)' },
    { id: 'royal', name: 'Royal', css: 'linear-gradient(160deg,#120a33,#4b2a9a)' },
    { id: 'ocean', name: 'Ocean', css: 'linear-gradient(170deg,#02101f,#0d5a7a)' },
    { id: 'plum', name: 'Plum', css: 'linear-gradient(160deg,#1c0716,#6d1f4f)' },
    { id: 'slate', name: 'Slate', css: 'linear-gradient(160deg,#0e1116,#3a4150)' }
  ];

  // ---------- lyric parsing ----------
  // A slide's text -> lyric lines [{ta, th, en}].
  // Tamil-script lines are Tamil. Latin lines are Thanglish when the slide has Tamil, otherwise English.
  // Optional explicit prefixes: [ta] [th] [en]. Section tags such as [VERSE 1] are ignored.
  function parseLyricLines(text) {
    const ta = [], th = [], en = [], plain = [];
    String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).forEach((l) => {
      const m = l.match(/^\[(ta|th|en)\]\s*(.+)$/i);
      if (m) return ({ ta, th, en })[m[1].toLowerCase()].push(m[2]);
      if (/^\[[^\]]+\]$/.test(l)) return;
      (TA.test(l) ? ta : plain).push(l);
    });
    (ta.length ? th : en).push(...plain);
    const n = Math.max(ta.length, th.length, en.length);
    return Array.from({ length: n }, (_, i) => ({ ta: ta[i] || '', th: th[i] || '', en: en[i] || '' }));
  }

  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

  // item -> list of screens
  function itemScreens(item, perScreen) {
    const n = Math.min(8, Math.max(1, +perScreen || 1));
    if (item.type === 'song') {
      const out = [];
      (item.sections || []).forEach((sec) => (sec.slides || []).forEach((txt) => {
        chunk(parseLyricLines(txt), n).forEach((lines) => out.push({ kind: 'text', label: sec.name, lines }));
      }));
      return out;
    }
    if (item.type === 'bible') {
      const verses = (item.verses || []).map((v) => ({ ta: v.ta || '', th: '', en: v.en || '', ref: v.ref }));
      return chunk(verses, n).map((lines) => ({
        kind: 'text', label: lines[0].ref, lines,
        caption: lines.length > 1 ? `${lines[0].ref} – ${lines[lines.length - 1].ref.split(':').pop()}` : lines[0].ref
      }));
    }
    if (item.type === 'image') return [{ kind: 'image', label: item.title, imageId: item.imageId }];
    return [];
  }

  const langsFor = (format) => ({ tamil: ['ta'], thanglish: ['th'], english: ['en'] }[format] || ['en', 'ta', 'th']);

  // ---------- screen rendering ----------
  // payload: { screen|null, settings, bgSrc, imgSrc }
  function bgStyle(settings, bgSrc) {
    const b = settings.bg || {};
    if (b.type === 'template') return (TEMPLATES.find((t) => t.id === b.value) || TEMPLATES[0]).css;
    if (b.type === 'media' && bgSrc) return `center / cover no-repeat url("${bgSrc}")`;
    return b.type === 'color' ? b.value : '#000';
  }

  function renderScreen(stage, payload, doFit = true) {
    const { screen, bgSrc, imgSrc } = payload;
    const s = loadSettings(payload.settings);
    stage.classList.add('stage');
    stage.innerHTML = '';
    const bg = document.createElement('div');
    bg.className = 'stage-bg';
    bg.style.background = bgStyle(s, bgSrc);
    const dim = document.createElement('div');
    dim.className = 'stage-dim';
    dim.style.opacity = String((s.dim || 0) / 100);
    stage.append(bg, dim);
    if (!screen) return;

    if (screen.kind === 'image') {
      if (imgSrc) { const im = document.createElement('img'); im.className = 'stage-img'; im.src = imgSrc; stage.append(im); }
      return;
    }
    const box = document.createElement('div');
    box.className = 'stage-text';
    const inner = document.createElement('div');
    inner.className = 'stage-inner';
    inner.style.color = s.textColor;
    inner.style.fontFamily = `"${s.font}", "Manrope", "Noto Sans", sans-serif`;
    const langs = langsFor(s.format);
    screen.lines.forEach((l) => {
      const row = document.createElement('div');
      row.className = 'lyric';
      langs.forEach((k) => { if (l[k]) { const d = document.createElement('div'); d.className = 'ln ' + k; d.textContent = l[k]; row.append(d); } });
      if (row.children.length) inner.append(row);
    });
    if (screen.caption && screen.lines[0].ref) {
      const c = document.createElement('div');
      c.className = 'ln cap';
      c.textContent = screen.caption;
      inner.append(c);
    }
    box.append(inner);
    stage.append(box);

    const base = (s.fontSize * stage.clientHeight) / 1080;
    const apply = (f) => box.style.setProperty('--en', (base * f).toFixed(2) + 'px');
    let f = 1; apply(f);
    if (doFit && stage.clientHeight > 0) {
      // auto-fit: shrink everything together (keeps the 50% ratio) until it fits the screen
      for (let i = 0; i < 45 && inner.getBoundingClientRect().height > box.clientHeight + 1; i++) { f *= 0.94; apply(f); }
    }
  }

  // ---------- RGB slim sliders ----------
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => (+v).toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  function rgbPicker(root, hex, onChange) {
    root.classList.add('rgb');
    root.innerHTML = ['r', 'g', 'b'].map((c) => `<input type="range" min="0" max="255" data-c="${c}" aria-label="${c.toUpperCase()}">`).join('')
      + '<div class="rgb-foot"><span class="sw"></span><input class="hex" maxlength="7" spellcheck="false"></div>';
    const ins = [...root.querySelectorAll('input[type=range]')];
    const hexIn = root.querySelector('.hex'), sw = root.querySelector('.sw');
    function paint(rgb) {
      const [r, g, b] = rgb;
      ins.forEach((el, i) => {
        el.value = rgb[i];
        const lo = rgb.slice(), hi = rgb.slice(); lo[i] = 0; hi[i] = 255;
        el.style.background = `linear-gradient(90deg, rgb(${lo}), rgb(${hi}))`;
      });
      const h = toHex(r, g, b); hexIn.value = h; sw.style.background = h; return h;
    }
    paint(fromHex(hex) || [255, 255, 255]);
    ins.forEach((el) => el.addEventListener('input', () => onChange(paint(ins.map((x) => +x.value)))));
    hexIn.addEventListener('change', () => { const v = fromHex(hexIn.value); if (v) onChange(paint(v)); else hexIn.value = toHex(...ins.map((x) => +x.value)); });
    return { set: (h) => paint(fromHex(h) || [0, 0, 0]) };
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return { api, getToken, setToken, logout, guard, DEFAULTS, loadSettings, TEMPLATES, parseLyricLines, itemScreens,
           renderScreen, rgbPicker, esc, dateKey, TAMIL_RATIO };
})();
