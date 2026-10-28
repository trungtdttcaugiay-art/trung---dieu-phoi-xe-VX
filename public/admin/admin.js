(() => {
  const $ = (s) => document.querySelector(s);
  const STATUS = { new: 'Mới', confirmed: 'Đã xác nhận', assigned: 'Đã gán xe', done: 'Hoàn thành', cancelled: 'Huỷ' };
  const KIND = { clinic: 'Bệnh nhân', outside: 'Ngoài TT', walkin: 'Vãng lai' };
  let state = { bookings: [], vehicles: [] }, filter = 'open';

  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => (k === 'class' ? (e.className = v) : k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v)));
    kids.flat().forEach((c) => e.append(c instanceof Node ? c : document.createTextNode(c ?? '')));
    return e;
  };
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => (t.style.display = 'none'), 2600); };
  const api = async (url, method = 'GET', body) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !url.includes('login')) { show(false); throw new Error('auth'); }
    return { ok: r.ok, status: r.status, data: j };
  };

  function show(authed) {
    $('#loginForm').classList.toggle('hide', authed);
    $('#app').classList.toggle('hide', !authed);
  }

  async function load() {
    const r = await api('/api/admin/data');
    if (r.ok) { state = r.data; render(); }
  }

  const fmtTime = (s) => String(s).replace('T', ' ').slice(0, 16);

  function render() {
    const vv = $('#vehiclesView'), bv = $('#bookingsView');
    vv.classList.toggle('hide', filter !== 'vehicles');
    bv.classList.toggle('hide', filter === 'vehicles');
    if (filter === 'vehicles') return renderVehicles();
    const today = new Date().toISOString().slice(0, 10);
    const rows = state.bookings.filter((b) =>
      filter === 'all' ? true : filter === 'today' ? String(b.pickup_at).startsWith(today) : !['done', 'cancelled'].includes(b.status))
      .sort((a, b) => (a.pickup_at > b.pickup_at ? 1 : -1));
    const tbl = el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ['Mã', 'Giờ đón', 'Khách', 'Đón / Đến', 'Loại · Số khách', 'Xe', 'Trạng thái', 'Phụ phí'].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.length ? rows.map(row) : [el('tr', {}, el('td', { colspan: 8 }, 'Chưa có đơn.'))]));
    bv.replaceChildren(tbl);
  }

  function row(b) {
    const vsel = el('select', { 'aria-label': 'Gán xe', onchange: (e) => patch(b.id, { vehicle_id: e.target.value || null }) },
      el('option', { value: '' }, '— chưa gán —'),
      state.vehicles.map((v) => { const o = el('option', { value: v.id }, v.name + (v.driver ? ' · ' + v.driver : '')); if (v.id === b.vehicle_id) o.selected = true; return o; }));
    const ssel = el('select', { 'aria-label': 'Trạng thái', onchange: (e) => patch(b.id, { status: e.target.value }) },
      Object.entries(STATUS).map(([k, v]) => { const o = el('option', { value: k }, v); if (k === b.status) o.selected = true; return o; }));
    const sur = el('input', { value: b.surcharge || '', placeholder: 'VD: 300.000đ', 'aria-label': 'Phụ phí', onchange: (e) => patch(b.id, { surcharge: e.target.value }) });
    const contact = [b.phone, b.messenger].filter(Boolean).join(' · ');
    return el('tr', {},
      el('td', {}, el('b', {}, b.ref), el('br'), el('span', { class: 'badge s-' + b.status }, STATUS[b.status] || b.status)),
      el('td', {}, fmtTime(b.pickup_at)),
      el('td', {}, el('b', {}, b.name), el('br'), el('a', { href: 'tel:' + b.phone.replace(/[^\d+]/g, '') }, contact)),
      el('td', {}, b.pickup + (b.hotel ? ` (${b.hotel})` : ''), el('br'), '→ ' + (b.dropoff || 'Phòng khám Việt Xô'), b.note ? el('div', { style: 'color:var(--muted-fg)' }, 'Ghi chú: ' + b.note) : ''),
      el('td', {}, el('span', { class: 'k-' + b.kind }, KIND[b.kind] || b.kind), el('br'), `${b.pax} khách · ${b.luggage} kiện`),
      el('td', {}, vsel), el('td', {}, ssel), el('td', {}, sur));
  }

  async function patch(id, body) {
    const r = await api('/api/admin/bookings/' + id, 'PATCH', body);
    if (r.status === 409) toast('Xe đã có chuyến trong khoảng 2 giờ (đơn ' + (r.data.with || '') + ')');
    else if (!r.ok) toast('Lỗi cập nhật');
    else toast('Đã lưu');
    load();
  }

  function renderVehicles() {
    $('#vehiclesView').replaceChildren(...state.vehicles.map((v) => {
      const f = {};
      const inp = (k, label) => { const i = el('input', { value: v[k] || '', 'aria-label': label, placeholder: label }); f[k] = i; return i; };
      return el('div', { class: 'vcard' }, el('b', {}, 'Xe #' + v.id), inp('name', 'Tên xe'), inp('plate', 'Biển số'), inp('driver', 'Tài xế'), inp('phone', 'SĐT tài xế'),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
          const r = await api('/api/admin/vehicles/' + v.id, 'PUT', Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value])));
          toast(r.ok ? 'Đã lưu xe' : 'Lỗi'); load();
        } }, 'Lưu'));
    }));
  }

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  $('#refresh').addEventListener('click', load);
  $('#logout').addEventListener('click', async () => { await api('/api/admin/logout', 'POST'); show(false); });
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('/api/admin/login', 'POST', { user: $('#u').value, password: $('#p').value });
    if (r.ok) { $('#loginErr').textContent = ''; show(true); load(); } else $('#loginErr').textContent = r.status === 429 ? 'Thử quá nhiều lần, chờ 15 phút.' : 'Sai tài khoản hoặc mật khẩu.';
  });
  api('/api/admin/me').then((r) => { if (r.data.authed) { show(true); load(); } });
  setInterval(() => { if (!$('#app').classList.contains('hide')) load().catch(() => {}); }, 30000);
})();
