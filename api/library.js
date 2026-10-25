// Read-only proxy for the existing Google Sheets libraries (songs + images).
// Nothing in the Sheets is modified.
const { handle, requireAuth, bad } = require('./_lib/http');

const cache = { songs: { t: 0, data: null }, images: { t: 0, data: null } };
const TTL = 60_000;

const asList = (d, key) => (Array.isArray(d) ? d : Array.isArray(d?.[key]) ? d[key] : Array.isArray(d?.data) ? d.data : []);
const parseMaybe = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };

function normSong(raw, i) {
  let sections = parseMaybe(raw.sections);
  if (!Array.isArray(sections)) {
    const slides = parseMaybe(raw.slides);
    sections = Array.isArray(slides)
      ? [{ name: 'VERSE 1', slides: slides.map((s) => (typeof s === 'string' ? s : s.content || s.text || s.lyrics || '')) }]
      : [];
  }
  return {
    id: String(raw.id || `song-${i}`),
    title: raw.title || raw.name || 'Untitled',
    singer: raw.groupName || raw.singer || '',
    sections: sections.map((s) => ({ name: String(s.name || 'VERSE').toUpperCase(), slides: (s.slides || []).map(String) }))
  };
}

async function load(type) {
  const c = cache[type];
  if (c.data && Date.now() - c.t < TTL) return c.data;
  const url = type === 'songs' ? process.env.SHEETS_SONGS_URL : process.env.SHEETS_IMAGES_URL;
  if (!url) throw bad(`${type} library URL is not configured`, 500);
  const r = await fetch(`${url}?action=read`);
  if (!r.ok) throw bad('Library is unavailable', 502);
  const json = await r.json();
  const data = type === 'songs'
    ? asList(json, 'songs').map(normSong)
    : asList(json, 'images').map((m, i) => ({
        id: String(m.id || `img-${i}`),
        title: m.title || m.name || 'Untitled image',
        category: m.category || 'General',
        imageData: m.imageData || m.data || ''
      })).filter((m) => m.imageData);
  cache[type] = { t: Date.now(), data };
  return data;
}

module.exports = handle(async (req) => {
  requireAuth(req);
  const { type, q = '', id } = req.query;
  if (!['songs', 'images'].includes(type)) throw bad('type must be songs or images');
  const all = await load(type);

  if (type === 'images' && id) {
    const m = all.find((x) => x.id === id);
    if (!m) throw bad('Not found', 404);
    return { image: m };
  }
  const needle = q.trim().toLowerCase();
  const hit = needle
    ? all.filter((x) => `${x.title} ${x.singer || ''} ${x.category || ''}`.toLowerCase().includes(needle)
        || (type === 'songs' && x.sections.some((s) => s.slides.some((t) => t.toLowerCase().includes(needle)))))
    : all;
  const items = hit.slice(0, 60).map((x) => type === 'songs'
    ? x
    : { id: x.id, title: x.title, category: x.category });
  return { items, total: hit.length };
});
