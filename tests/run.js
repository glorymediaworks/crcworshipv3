// Minimal tests: auth token, login, sessions API (mock DB), lyric parsing, Bible integrity.
process.env.JWT_SECRET = 'test-secret'; process.env.ADMIN_USERNAME = 'admin'; process.env.ADMIN_PASSWORD = 'pw';
const assert = require('assert'); const path = require('path'); const fs = require('fs');

// mock db
const store = new Map();
require.cache[require.resolve('../api/_lib/db')] = { id: 'db', filename: 'db', loaded: true, exports: { getDb: async () => ({ collection: () => ({
  findOne: async ({ _id }) => store.get(_id) || null,
  updateOne: async ({ _id }, u) => { store.set(_id, { _id, ...(store.get(_id) || {}), ...u.$set }); },
  deleteOne: async ({ _id }) => store.delete(_id),
  aggregate: () => ({ toArray: async () => [...store.values()].map((d) => ({ _id: d._id, title: d.title, count: d.items.length })) })
}) }) } };

const call = (mod, { method = 'GET', query = {}, body, token } = {}) => new Promise((resolve) => {
  const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; },
    json(o) { this.writableEnded = true; resolve({ code: this.code || 200, body: o }); }, end() { this.writableEnded = true; resolve({ code: this.code }); } };
  require(mod)({ method, query, body, headers: token ? { authorization: 'Bearer ' + token } : {} }, res);
});

(async () => {
  const bad = await call('../api/login', { method: 'POST', body: { username: 'admin', password: 'x' } });
  assert.equal(bad.code, 401);
  const ok = await call('../api/login', { method: 'POST', body: { username: 'admin', password: 'pw' } });
  assert.equal(ok.code, 200); const token = ok.body.token;
  assert.equal((await call('../api/sessions', { query: { date: '2026-11-01' } })).code, 401);
  assert.equal((await call('../api/sessions', { query: { date: '2026-11-01' }, token: token + 'x' })).code, 401);
  assert.equal((await call('../api/sessions', { method: 'PUT', token, body: { date: 'bad', items: [] } })).code, 400);
  await call('../api/sessions', { method: 'PUT', token, body: { date: '2026-11-01', title: 'Sunday', items: [{ id: 1 }], settings: { lines: 3 } } });
  const g = await call('../api/sessions', { query: { date: '2026-11-01' }, token });
  assert.equal(g.body.session.title, 'Sunday'); assert.equal(g.body.session.settings.lines, 3);
  assert.equal((await call('../api/sessions', { query: { date: '2026-11-02' }, token })).body.session, null);
  assert.equal((await call('../api/sessions', { query: { month: '2026-11' }, token })).body.sessions[0].count, 1);
  console.log('api ok');

  // front-end parsing (core.js is browser code; load with a stub window)
  global.window = {}; global.localStorage = {}; eval(fs.readFileSync(path.join(__dirname, '../public/js/core.js'), 'utf8'));
  const C = window.CRC;
  const L = C.parseLyricLines('[VERSE 1]\nஉந்தன் பிரசன்னத்தில்\nஅமர்ந்திருந்து\nUndhan Pirasannaththil\nAmarndhirundhu');
  assert.deepEqual(L.map((x) => [x.ta, x.th]), [['உந்தன் பிரசன்னத்தில்', 'Undhan Pirasannaththil'], ['அமர்ந்திருந்து', 'Amarndhirundhu']]);
  assert.equal(C.parseLyricLines('Amazing grace\nHow sweet')[0].en, 'Amazing grace');
  assert.equal(C.parseLyricLines('[en] Hello\n[ta] வணக்கம்')[0].ta, 'வணக்கம்');
  const song = { type: 'song', sections: [{ name: 'V1', slides: ['a\nb\nc\nd\ne'] }] };
  assert.equal(C.itemScreens(song, 2).length, 3); assert.equal(C.itemScreens(song, 8).length, 1);
  console.log('parsing ok');

  const cfg = require('../public/bible/data/bible-config.json'); const en = require('../public/bible/data/english.json');
  console.log('bible books:', cfg.bookOrder.length, 'verses(en):', Object.keys(en).length, 'JHN.3.16:', !!en['JHN.3.16']);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
