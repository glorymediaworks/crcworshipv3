const crypto = require('crypto');
const { handle, signToken, bad } = require('./_lib/http');

const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

module.exports = handle(async (req) => {
  if (req.method !== 'POST') throw bad('Use POST', 405);
  const { username, password } = req.body || {};
  const okUser = same(username || '', process.env.ADMIN_USERNAME || '');
  const okPass = same(password || '', process.env.ADMIN_PASSWORD || '');
  if (!process.env.ADMIN_PASSWORD || !(okUser && okPass)) throw bad('Invalid username or password', 401);
  return { token: signToken({ u: process.env.ADMIN_USERNAME }), name: process.env.ADMIN_USERNAME };
});
