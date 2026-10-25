const { getDb } = require('./_lib/db');
const { handle, requireAuth, bad } = require('./_lib/http');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

module.exports = handle(async (req) => {
  requireAuth(req);
  const col = (await getDb()).collection('sessions');
  const { date, month } = req.query;

  if (req.method === 'GET') {
    if (month) {
      if (!MONTH.test(month)) throw bad('Invalid month');
      const rows = await col.aggregate([
        { $match: { _id: { $regex: `^${month}-` } } },
        { $project: { title: 1, count: { $size: { $ifNull: ['$items', []] } } } }
      ]).toArray();
      return { sessions: rows.map((r) => ({ date: r._id, title: r.title || '', count: r.count })) };
    }
    if (!DATE.test(date || '')) throw bad('Invalid date');
    const doc = await col.findOne({ _id: date });
    return { session: doc ? { date: doc._id, title: doc.title, items: doc.items || [], settings: doc.settings || null } : null };
  }

  if (req.method === 'PUT') {
    const b = req.body || {};
    if (!DATE.test(b.date || '')) throw bad('Invalid date');
    if (!Array.isArray(b.items) || b.items.length > 200) throw bad('Invalid items');
    if (JSON.stringify(b).length > 3_000_000) throw bad('Session too large', 413);
    await col.updateOne(
      { _id: b.date },
      { $set: { title: String(b.title || '').slice(0, 120), items: b.items, settings: b.settings || null, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    return { ok: true };
  }

  if (req.method === 'DELETE') {
    if (!DATE.test(date || '')) throw bad('Invalid date');
    await col.deleteOne({ _id: date });
    return { ok: true };
  }
  throw bad('Method not allowed', 405);
});
