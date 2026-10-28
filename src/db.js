// Lưu trữ: MySQL (Hostinger) khi có DB_HOST, ngược lại dùng file JSON để chạy thử local.
const fs = require('fs');
const path = require('path');

const useMysql = !!process.env.DB_HOST;
const FILE = path.join(__dirname, '..', 'data', 'store.json');
let pool;

const DEFAULT_VEHICLES = [1, 2, 3, 4].map((n) => ({
  id: n, name: `Xe ${n} · 16 chỗ`, plate: '', driver: '', phone: '', active: 1,
}));

function readFile() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { seq: 0, bookings: [], vehicles: DEFAULT_VEHICLES }; }
}
function writeFile(d) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}

async function init() {
  if (!useMysql) return;
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    host: process.env.DB_HOST, port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, charset: 'utf8mb4', waitForConnections: true, connectionLimit: 5,
  });
  await pool.query(`CREATE TABLE IF NOT EXISTS vehicles (
    id INT PRIMARY KEY, name VARCHAR(80) NOT NULL, plate VARCHAR(20) DEFAULT '',
    driver VARCHAR(80) DEFAULT '', phone VARCHAR(30) DEFAULT '', active TINYINT DEFAULT 1
  ) CHARACTER SET utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY, ref VARCHAR(16) NOT NULL,
    name VARCHAR(120) NOT NULL, phone VARCHAR(40) NOT NULL, messenger VARCHAR(80) DEFAULT '',
    kind VARCHAR(12) NOT NULL, hotel VARCHAR(160) DEFAULT '', pickup VARCHAR(200) NOT NULL,
    dropoff VARCHAR(200) DEFAULT '', pickup_at DATETIME NOT NULL, pax INT NOT NULL, luggage INT DEFAULT 0,
    note TEXT, lang VARCHAR(4) DEFAULT 'ru', status VARCHAR(12) DEFAULT 'new',
    vehicle_id INT NULL, surcharge VARCHAR(120) DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (pickup_at), INDEX (status)
  ) CHARACTER SET utf8mb4`);
  const [[{ c }]] = await pool.query('SELECT COUNT(*) c FROM vehicles');
  if (!c) for (const v of DEFAULT_VEHICLES)
    await pool.query('INSERT INTO vehicles (id,name) VALUES (?,?)', [v.id, v.name]);
}

const toDate = (s) => String(s).replace('T', ' ').slice(0, 19);

async function createBooking(b) {
  if (useMysql) {
    const [r] = await pool.query(
      `INSERT INTO bookings (ref,name,phone,messenger,kind,hotel,pickup,dropoff,pickup_at,pax,luggage,note,lang)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.ref, b.name, b.phone, b.messenger, b.kind, b.hotel, b.pickup, b.dropoff, toDate(b.pickup_at), b.pax, b.luggage, b.note, b.lang]);
    return { ...b, id: r.insertId, status: 'new', vehicle_id: null, surcharge: '' };
  }
  const d = readFile();
  const row = { ...b, id: ++d.seq, status: 'new', vehicle_id: null, surcharge: '', created_at: new Date().toISOString() };
  d.bookings.push(row); writeFile(d);
  return row;
}

async function listBookings() {
  if (useMysql) {
    const [rows] = await pool.query(
      `SELECT *, DATE_FORMAT(pickup_at,'%Y-%m-%dT%H:%i') pickup_at FROM bookings ORDER BY pickup_at DESC LIMIT 500`);
    return rows;
  }
  return readFile().bookings.slice().sort((a, b) => (a.pickup_at < b.pickup_at ? 1 : -1));
}

async function getBooking(id) {
  return (await listBookings()).find((x) => x.id === +id);
}

async function updateBooking(id, patch) {
  const allowed = ['status', 'vehicle_id', 'surcharge'];
  const keys = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!keys.length) return;
  if (useMysql) {
    await pool.query(`UPDATE bookings SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`,
      [...keys.map((k) => patch[k]), id]);
    return;
  }
  const d = readFile();
  const row = d.bookings.find((x) => x.id === +id);
  if (row) keys.forEach((k) => (row[k] = patch[k]));
  writeFile(d);
}

async function listVehicles() {
  if (useMysql) { const [r] = await pool.query('SELECT * FROM vehicles ORDER BY id'); return r; }
  return readFile().vehicles;
}

async function updateVehicle(id, v) {
  const f = { name: v.name, plate: v.plate, driver: v.driver, phone: v.phone };
  if (useMysql) {
    await pool.query('UPDATE vehicles SET name=?,plate=?,driver=?,phone=? WHERE id=?',
      [f.name, f.plate, f.driver, f.phone, id]);
    return;
  }
  const d = readFile();
  Object.assign(d.vehicles.find((x) => x.id === +id) || {}, f);
  writeFile(d);
}

module.exports = { init, createBooking, listBookings, getBooking, updateBooking, listVehicles, updateVehicle, useMysql };
