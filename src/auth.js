// Đăng nhập admin bằng cookie ký HMAC (không cần thư viện session).
const crypto = require('crypto');
const SECRET = () => process.env.SESSION_SECRET || 'dev-secret-change-me';
const sign = (v) => crypto.createHmac('sha256', SECRET()).update(v).digest('hex');

function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function issue(res) {
  const exp = Date.now() + 12 * 3600e3;
  res.cookie('vx_admin', `${exp}.${sign(String(exp))}`, {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 3600e3,
  });
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((s) => s.trim().split('=')).filter((p) => p[0]));
}

function isAuthed(req) {
  const v = parseCookies(req).vx_admin;
  if (!v) return false;
  const [exp, sig] = v.split('.');
  return +exp > Date.now() && safeEq(sig || '', sign(exp));
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

function check(user, pass) {
  const u = process.env.ADMIN_USER || 'admin', p = process.env.ADMIN_PASSWORD;
  return !!p && safeEq(user, u) && safeEq(pass, p);
}

module.exports = { issue, require: requireAuth, check, isAuthed };
