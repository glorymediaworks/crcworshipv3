const crypto = require('crypto');

const b64 = (b) => Buffer.from(b).toString('base64url');
const secret = () => process.env.JWT_SECRET || '';

function signToken(payload, ttlSeconds = 12 * 3600) {
  if (!secret()) throw Object.assign(new Error('JWT_SECRET is not set'), { status: 500 });
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !secret()) return null;
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig), c = Buffer.from(good);
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

function requireAuth(req) {
  const h = req.headers.authorization || '';
  const user = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!user) throw Object.assign(new Error('Please sign in again'), { status: 401 });
  return user;
}

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

function handle(fn) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      const out = await fn(req, res);
      if (!res.writableEnded) res.status(200).json(out ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      res.status(status).json({ error: status >= 500 ? 'Server error' : e.message });
    }
  };
}

module.exports = { signToken, verifyToken, requireAuth, handle, bad };
