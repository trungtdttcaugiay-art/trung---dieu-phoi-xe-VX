require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./src/db');
const auth = require('./src/auth');
const { notifyNewBooking } = require('./src/notify');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ['https://www.google.com'],
      formAction: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));

const clean = (v, n = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const KINDS = ['clinic', 'outside', 'walkin'];
const SOURCES = ['ANEX', 'AB', 'AMEGA', 'WALKIN'];
const STATUSES = ['new', 'confirmed', 'assigned', 'done', 'cancelled'];

const CLINIC_QUERY = () => process.env.CLINIC_MAP_QUERY || 'Phòng khám nha khoa quốc tế Việt Xô Nha Trang';
app.get('/api/config', (req, res) => res.json({ clinicQuery: CLINIC_QUERY() }));

// Danh sách xe hiển thị công khai: chỉ xe đã điền biển số hoặc tên tài xế.
app.get('/api/fleet', async (req, res) => {
  const vs = await db.listVehicles();
  res.json(vs.filter((v) => v.active && (v.plate || v.driver))
    .map((v) => ({ name: v.name, plate: v.plate, driver: v.driver, phone: v.phone })));
});

// Mã ID khách: cùng số điện thoại luôn ra cùng một mã, khách quay lại giữ nguyên ID.
const guestId = (phone) => {
  const digits = phone.replace(/\D/g, '');
  const n = BigInt('0x' + crypto.createHash('sha256').update(digits).digest('hex').slice(0, 12));
  return 'KH' + n.toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
};

const bookLimit = rateLimit({ windowMs: 15 * 60e3, max: 10, standardHeaders: true, legacyHeaders: false });
app.post('/api/bookings', bookLimit, async (req, res) => {
  try {
    const b = req.body || {};
    if (clean(b.website)) return res.json({ ok: true }); // honeypot chống bot
    const row = {
      ref: 'VX' + Date.now().toString(36).toUpperCase().slice(-6),
      name: clean(b.name, 120), phone: clean(b.phone, 40), messenger: clean(b.messenger, 80),
      kind: KINDS.includes(b.kind) ? b.kind : 'clinic',
      hotel: clean(b.hotel, 160), pickup: clean(b.pickup, 200), dropoff: clean(b.dropoff, 200),
      pickup_at: clean(b.pickup_at, 25), pax: Math.min(16, Math.max(1, parseInt(b.pax) || 1)),
      source: SOURCES.includes(b.source) ? b.source : 'WALKIN',
      note: clean(b.note, 1000), lang: ['ru', 'vi', 'en'].includes(b.lang) ? b.lang : 'ru',
    };
    const when = new Date(row.pickup_at);
    if (!row.name || row.phone.replace(/\D/g, '').length < 7 || !row.pickup || isNaN(when))
      return res.status(400).json({ error: 'invalid' });
    if (when.getTime() < Date.now() - 3600e3) return res.status(400).json({ error: 'past' });
    // ID khách: ưu tiên mã người dùng nhập, nếu trống thì tự tạo từ số điện thoại.
    row.guest_id = clean(b.guest_id, 24).replace(/\s+/g, '').toUpperCase() || guestId(row.phone);
    const saved = await db.createBooking(row);
    notifyNewBooking(saved).catch((e) => console.error('notify', e.message));
    res.json({ ok: true, ref: saved.ref, guest_id: saved.guest_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
});

// ---- Admin ----
const loginLimit = rateLimit({ windowMs: 15 * 60e3, max: 10, standardHeaders: true, legacyHeaders: false });
app.post('/api/admin/login', loginLimit, (req, res) => {
  if (!auth.check(clean(req.body?.user), String(req.body?.password ?? ''))) return res.status(401).json({ error: 'bad' });
  auth.issue(res);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie('vx_admin'); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ authed: auth.isAuthed(req) }));

app.get('/api/admin/data', auth.require, async (req, res) => {
  res.json({ bookings: await db.listBookings(), vehicles: await db.listVehicles() });
});

// Một xe không nhận 2 chuyến cách nhau dưới 2 giờ.
app.patch('/api/admin/bookings/:id', auth.require, async (req, res) => {
  const id = +req.params.id, p = req.body || {}, patch = {};
  const cur = await db.getBooking(id);
  if (!cur) return res.status(404).json({ error: 'notfound' });
  if (p.status !== undefined) {
    if (!STATUSES.includes(p.status)) return res.status(400).json({ error: 'status' });
    patch.status = p.status;
  }
  if (p.surcharge !== undefined) patch.surcharge = clean(p.surcharge, 120);
  if (p.vehicle_id !== undefined) {
    const vid = p.vehicle_id === null || p.vehicle_id === '' ? null : +p.vehicle_id;
    if (vid !== null) {
      // Cùng xe: đón ghép được nếu cách nhau dưới 45 phút và tổng khách ≤ 16; từ 45 phút đến 2 giờ là trùng lịch.
      const t = new Date(cur.pickup_at).getTime();
      const clash = (await db.listBookings()).find((o) => {
        if (o.id === id || o.vehicle_id !== vid || ['cancelled', 'done'].includes(o.status)) return false;
        const dt = Math.abs(new Date(o.pickup_at).getTime() - t);
        return dt < 45 * 60e3 ? o.pax + cur.pax > 16 : dt < 2 * 3600e3;
      });
      if (clash) return res.status(409).json({ error: 'clash', with: clash.ref });
    }
    patch.vehicle_id = vid;
    if (vid && (cur.status === 'new' || cur.status === 'confirmed') && !patch.status) patch.status = 'assigned';
  }
  await db.updateBooking(id, patch);
  res.json({ ok: true });
});

// Cấu hình cho trang admin: địa chỉ phòng khám + có bật tối ưu lộ trình Google hay không.
app.get('/api/admin/config', auth.require, (req, res) =>
  res.json({ clinicQuery: CLINIC_QUERY(), optimize: !!process.env.GOOGLE_MAPS_API_KEY }));

// Sắp xếp thứ tự đón tối ưu: xuất phát từ phòng khám, đi qua các điểm đón, quay về phòng khám.
app.post('/api/admin/route-order', auth.require, async (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const stops = (Array.isArray(req.body?.stops) ? req.body.stops : []).map((s) => clean(s, 200)).filter(Boolean).slice(0, 15);
  if (!key) return res.status(501).json({ error: 'no-key' });
  if (stops.length < 2) return res.json({ order: stops.map((_, i) => i) });
  try {
    const clinic = CLINIC_QUERY();
    const url = 'https://maps.googleapis.com/maps/api/directions/json?' + new URLSearchParams({
      origin: clinic, destination: clinic, waypoints: 'optimize:true|' + stops.join('|'), mode: 'driving', key,
    });
    const j = await (await fetch(url)).json();
    if (j.status !== 'OK') return res.status(502).json({ error: j.status });
    const legs = j.routes[0].legs;
    res.json({
      order: j.routes[0].waypoint_order,
      minutes: Math.round(legs.reduce((s, l) => s + l.duration.value, 0) / 60),
      km: Math.round(legs.reduce((s, l) => s + l.distance.value, 0) / 100) / 10,
    });
  } catch (e) {
    console.error('route-order', e.message);
    res.status(502).json({ error: 'maps' });
  }
});

app.put('/api/admin/vehicles/:id', auth.require, async (req, res) => {
  const v = req.body || {};
  await db.updateVehicle(+req.params.id, {
    name: clean(v.name, 80), plate: clean(v.plate, 20), driver: clean(v.driver, 80), phone: clean(v.phone, 30),
  });
  res.json({ ok: true });
});

app.get('/healthz', (req, res) => res.send('ok'));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'invalid' });
  console.error(err);
  res.status(500).json({ error: 'server' });
});

const port = process.env.PORT || 3000;
db.init()
  .then(() => app.listen(port, () => console.log(`Viet Xo Transfer chạy tại cổng ${port} (${db.useMysql ? 'MySQL' : 'file JSON'})`)))
  .catch((e) => { console.error('Không khởi tạo được DB:', e.message); process.exit(1); });
