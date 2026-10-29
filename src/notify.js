// Gửi thông báo đơn mới qua Telegram, Zalo OA, Email. Kênh nào chưa cấu hình sẽ bỏ qua.
const KIND = { clinic: 'Bệnh nhân phòng khám', outside: 'Ngoài trung tâm (phụ phí)', walkin: 'Khách vãng lai (phụ phí)' };

function text(b) {
  return [
    `ĐƠN XE MỚI #${b.ref}`,
    `Loại: ${KIND[b.kind] || b.kind}`,
    `Khách: ${b.name} [ID ${b.guest_id}] · ${b.phone}${b.messenger ? ' · ' + b.messenger : ''}`,
    `Giờ đón: ${String(b.pickup_at).replace('T', ' ')}`,
    `Đón: ${b.pickup}${b.hotel ? ' (' + b.hotel + ')' : ''}`,
    `Đến: ${b.dropoff || 'Phòng khám Việt Xô'}`,
    `Số khách: ${b.pax} · Hành lý: ${b.luggage}`,
    b.note ? `Ghi chú: ${b.note}` : '',
  ].filter(Boolean).join('\n');
}

async function telegram(msg) {
  const { TELEGRAM_BOT_TOKEN: t, TELEGRAM_CHAT_ID: c } = process.env;
  if (!t || !c) return;
  const r = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: c, text: msg }),
  });
  if (!r.ok) throw new Error('telegram ' + r.status);
}

async function zalo(msg) {
  const { ZALO_OA_TOKEN: t, ZALO_USER_ID: u } = process.env;
  if (!t || !u) return;
  const r = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
    method: 'POST', headers: { 'Content-Type': 'application/json', access_token: t },
    body: JSON.stringify({ recipient: { user_id: u }, message: { text: msg } }),
  });
  if (!r.ok) throw new Error('zalo ' + r.status);
}

async function email(msg, ref) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_TO } = process.env;
  if (!SMTP_HOST || !MAIL_TO) return;
  const nodemailer = require('nodemailer');
  const port = +(SMTP_PORT || 465);
  const tr = nodemailer.createTransport({
    host: SMTP_HOST, port, secure: port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  await tr.sendMail({ from: MAIL_FROM || SMTP_USER, to: MAIL_TO, subject: `Đơn xe mới #${ref}`, text: msg });
}

async function notifyNewBooking(b) {
  const msg = text(b);
  const res = await Promise.allSettled([telegram(msg), zalo(msg), email(msg, b.ref)]);
  res.forEach((r, i) => r.status === 'rejected' &&
    console.error(['telegram', 'zalo', 'email'][i], 'lỗi:', r.reason.message));
}

module.exports = { notifyNewBooking };
