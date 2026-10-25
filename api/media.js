// "My uploads" for screen backgrounds, stored in MongoDB.
const { ObjectId } = require('mongodb');
const { getDb } = require('./_lib/db');
const { handle, requireAuth, bad } = require('./_lib/http');

module.exports = handle(async (req) => {
  requireAuth(req);
  const col = (await getDb()).collection('media');
  const { id } = req.query;

  if (req.method === 'GET') {
    if (id) {
      const m = await col.findOne({ _id: new ObjectId(id) });
      if (!m) throw bad('Not found', 404);
      return { id, title: m.title, dataUrl: m.dataUrl };
    }
    const rows = await col.find({}, { projection: { title: 1, thumb: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(100).toArray();
    return { items: rows.map((r) => ({ id: String(r._id), title: r.title, thumb: r.thumb || '' })) };
  }
  if (req.method === 'POST') {
    const { title, dataUrl, thumb } = req.body || {};
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl || '')) throw bad('Only JPEG, PNG or WebP images');
    if (dataUrl.length > 2_500_000) throw bad('Image too large (max ~1.8 MB)', 413);
    const r = await col.insertOne({ title: String(title || 'Upload').slice(0, 80), dataUrl, thumb: String(thumb || '').slice(0, 60_000), createdAt: new Date() });
    return { id: String(r.insertedId) };
  }
  if (req.method === 'DELETE') {
    if (!id) throw bad('id required');
    await col.deleteOne({ _id: new ObjectId(id) });
    return { ok: true };
  }
  throw bad('Method not allowed', 405);
});
