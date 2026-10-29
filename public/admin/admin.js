(() => {
  const $ = (s) => document.querySelector(s);
  const STATUS = { new: 'Mới', confirmed: 'Đã xác nhận', assigned: 'Đã gán xe', done: 'Hoàn thành', cancelled: 'Huỷ' };
  const KIND = { pickup: 'Đón khách', dropoff: 'Đưa về', clinic: 'Bệnh nhân', outside: 'Ngoài TT', walkin: 'Vãng lai' };
  const SOURCE = { ANEX: 'ANEX', AB: 'AB', AMEGA: 'AMEGA', WALKIN: 'Vãng lai' };
  let state = { bookings: [], vehicles: [] }, filter = 'open';
  let cfg = { clinicQuery: 'Phòng khám nha khoa quốc tế Việt Xô Nha Trang', optimize: false };
  let planDate = new Date().toISOString().slice(0, 10);
  let plan = null; // { runs, unassigned }
  const orderCache = {}; // key các điểm đón -> { order, minutes, km }

  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => (k === 'class' ? (e.className = v) : k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v)));
    kids.flat().forEach((c) => e.append(c instanceof Node ? c : document.createTextNode(c ?? '')));
    return e;
  };
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => (t.style.display = 'none'), 2800); };
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

  const tel = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
  const gmaps = (stops, dest) => {
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(cfg.clinicQuery) +
      '&destination=' + encodeURIComponent(dest || cfg.clinicQuery) +
      (stops.length ? '&waypoints=' + encodeURIComponent(stops.join('|')) : '');
  };
  const fmtTime = (s) => String(s).replace('T', ' ').slice(0, 16);
  const fmtCreated = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

  async function load() {
    const r = await api('/api/admin/data');
    if (r.ok) { state = r.data; render(); }
  }

  /* ---------- Danh sách đơn ---------- */
  function render() {
    const vv = $('#vehiclesView'), bv = $('#bookingsView'), pv = $('#planView');
    vv.classList.toggle('hide', filter !== 'vehicles');
    pv.classList.toggle('hide', filter !== 'plan');
    bv.classList.toggle('hide', filter === 'vehicles' || filter === 'plan');
    if (filter === 'vehicles') return renderVehicles();
    if (filter === 'plan') return renderPlan();
    const today = new Date().toISOString().slice(0, 10);
    const rows = state.bookings.filter((b) =>
      filter === 'all' ? true : filter === 'today' ? String(b.pickup_at).startsWith(today) : !['done', 'cancelled'].includes(b.status))
      .sort((a, b) => (a.pickup_at > b.pickup_at ? 1 : -1));
    const tbl = el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ['Mã · Giờ đặt', 'Giờ đón', 'Khách', 'Đón / Đến', 'Nguồn · Loại', 'Xe', 'Trạng thái', 'Phụ phí'].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.length ? rows.map(row) : [el('tr', {}, el('td', { colspan: 8 }, 'Chưa có đơn.'))]));
    bv.replaceChildren(tbl);
  }

  function row(b) {
    const vsel = el('select', { 'aria-label': 'Gán xe', onchange: (e) => patch(b.id, { vehicle_id: e.target.value || null }) },
      el('option', { value: '' }, '— chưa gán —'),
      state.vehicles.map((v) => { const o = el('option', { value: v.id }, [v.name, v.plate, v.driver].filter(Boolean).join(' · ')); if (v.id === b.vehicle_id) o.selected = true; return o; }));
    const ssel = el('select', { 'aria-label': 'Trạng thái', onchange: (e) => patch(b.id, { status: e.target.value }) },
      Object.entries(STATUS).map(([k, v]) => { const o = el('option', { value: k }, v); if (k === b.status) o.selected = true; return o; }));
    const sur = el('input', { value: b.surcharge || '', placeholder: 'VD: 300.000đ', 'aria-label': 'Phụ phí', onchange: (e) => patch(b.id, { surcharge: e.target.value }) });
    const veh = state.vehicles.find((v) => v.id === b.vehicle_id);
    const vinfo = veh ? el('div', { style: 'margin-top:6px;font-size:.85rem;color:var(--muted-fg)' }, [veh.plate, veh.driver].filter(Boolean).join(' · '), veh.phone ? el('br') : '', veh.phone ? el('a', { href: tel(veh.phone) }, veh.phone) : '') : '';
    return el('tr', {},
      el('td', {}, el('b', {}, b.ref), el('br'), el('span', { class: 'badge s-' + b.status }, STATUS[b.status] || b.status), el('div', { style: 'font-size:.8rem;color:var(--muted-fg);margin-top:4px' }, 'Đặt ' + fmtCreated(b.created_at))),
      el('td', {}, fmtTime(b.pickup_at)),
      el('td', {}, el('b', {}, b.name || '(chưa ghi tên)'), el('br'), el('span', { class: 'badge s-confirmed' }, 'ID ' + (b.guest_id || '—')), el('br'), b.phone ? el('a', { href: tel(b.phone) }, [b.phone, b.messenger].filter(Boolean).join(' · ')) : (b.messenger || '')),
      el('td', {}, el('small', {}, 'Đi: '), b.pickup, el('br'), el('small', {}, 'Đến: '), b.dropoff, el('br'),
        el('a', { href: 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(b.pickup) + '&destination=' + encodeURIComponent(b.dropoff), target: '_blank', rel: 'noopener' }, 'Chỉ đường Google Maps'),
        b.note ? el('div', { style: 'color:var(--muted-fg)' }, 'Ghi chú: ' + b.note) : ''),
      el('td', {}, el('span', { class: 'badge s-assigned' }, SOURCE[b.source] || '—'), el('br'), el('span', { class: 'k-' + b.kind }, KIND[b.kind] || b.kind), el('br'), `${b.pax} khách`),
      el('td', {}, vsel, vinfo), el('td', {}, ssel), el('td', {}, sur));
  }

  async function patch(id, body) {
    const r = await api('/api/admin/bookings/' + id, 'PATCH', body);
    if (r.status === 409) toast('Xe đã có chuyến trùng giờ (đơn ' + (r.data.with || '') + ')');
    else if (!r.ok) toast('Lỗi cập nhật');
    else toast('Đã lưu');
    load();
  }

  /* ---------- Lịch trình đưa đón ---------- */
  // Khu vực: Cam Ranh (xa, ~45-60 phút) hay trung tâm Nha Trang.
  const zoneOf = (b) => {
    const txt = (b.hotel + ' ' + b.pickup + ' ' + b.dropoff).toLowerCase();
    const known = (window.HOTELS?.camranh || []).some((n) => txt.includes(n.toLowerCase()));
    return known || /cam ranh|камран|camranh/.test(txt) ? 'camranh' : 'center';
  };
  const RUN_MIN = { center: 120, camranh: 180 }; // thời gian một chuyến (phút) trước khi xe rảnh lại
  const MERGE_MIN = 30; // đón ghép: các đơn cùng khu vực, lệch nhau tối đa 30 phút
  const minOf = (s) => { const [h, m] = String(s).slice(11, 16).split(':').map(Number); return h * 60 + m; };
  // Điểm dừng của khách = khách sạn (điểm đi của lịch đón, điểm đến của lịch đưa về)
  const stopOf = (b) => [b.hotel || (b.kind === 'dropoff' ? b.dropoff : b.pickup),zoneOf(b) === 'camranh' ? 'Cam Ranh' : 'Nha Trang'].join(', ');

  function buildPlan(date) {
    const day = state.bookings.filter((b) => String(b.pickup_at).startsWith(date) && !['cancelled', 'done'].includes(b.status))
      .sort((a, b) => (a.pickup_at > b.pickup_at ? 1 : -1));
    // 1) Gom các đơn gần giờ, cùng khu vực thành một chuyến (tối đa 16 khách)
    const runs = [];
    day.forEach((b) => {
      const z = zoneOf(b), t = minOf(b.pickup_at);
      const run = runs.find((r) => r.zone === z && t - r.start <= MERGE_MIN && r.pax + b.pax <= 16);
      if (run) { run.bookings.push(b); run.pax += b.pax; } else runs.push({ zone: z, start: t, pax: b.pax, bookings: [b], vehicle: null });
    });
    // 2) Gán xe: xe rảnh sớm nhất; xe đã có chuyến cùng khu vực được ưu tiên để tiết kiệm đường
    const free = Object.fromEntries(state.vehicles.map((v) => [v.id, { at: -1, zone: null }]));
    const unassigned = [];
    runs.forEach((r) => {
      const cand = state.vehicles.filter((v) => free[v.id].at <= r.start);
      cand.sort((a, b) => (free[b.id].zone === r.zone) - (free[a.id].zone === r.zone) || free[b.id].at - free[a.id].at);
      const v = cand[0];
      if (!v) { unassigned.push(r); return; }
      r.vehicle = v;
      free[v.id] = { at: r.start + RUN_MIN[r.zone], zone: r.zone };
    });
    return { runs, unassigned };
  }

  const runKey = (r) => r.bookings.map((b) => b.id).join('-');
  const runStops = (r) => {
    const stops = [...new Set(r.bookings.map(stopOf))];
    const o = orderCache[runKey(r)];
    return o ? o.order.map((i) => stops[i]) : stops;
  };

  async function optimizeAll() {
    if (!plan) return;
    let n = 0;
    for (const r of plan.runs) {
      const stops = [...new Set(r.bookings.map(stopOf))];
      if (stops.length < 2) continue;
      const res = await api('/api/admin/route-order', 'POST', { stops });
      if (res.ok) { orderCache[runKey(r)] = res.data; n++; } else { toast('Không tối ưu được: ' + (res.data.error || res.status)); break; }
    }
    if (n) toast('Đã sắp xếp lại ' + n + ' chuyến theo Google Maps');
    renderPlan();
  }

  async function applyPlan() {
    if (!plan) return;
    const all = plan.runs.flatMap((r) => r.bookings);
    for (const b of all) if (b.vehicle_id) await api('/api/admin/bookings/' + b.id, 'PATCH', { vehicle_id: null });
    let fail = 0;
    for (const r of plan.runs) {
      if (!r.vehicle) continue;
      for (const b of r.bookings) {
        const res = await api('/api/admin/bookings/' + b.id, 'PATCH', { vehicle_id: r.vehicle.id });
        if (!res.ok) fail++;
      }
    }
    toast(fail ? `Đã xếp xe, ${fail} đơn bị trùng lịch` : 'Đã áp dụng xếp xe');
    await load();
  }

  function renderPlan() {
    const pv = $('#planView');
    plan = buildPlan(planDate);
    const date = el('input', { type: 'date', value: planDate, id: 'planDate', 'aria-label': 'Ngày', onchange: (e) => { planDate = e.target.value; renderPlan(); } });
    const bar = el('div', { class: 'planbar' }, date,
      el('button', { class: 'btn btn-primary', type: 'button', onclick: applyPlan }, 'Áp dụng xếp xe'),
      el('button', { class: 'btn btn-ghost', type: 'button', onclick: optimizeAll }, 'Tối ưu thứ tự đón (Google)'));
    const note = el('p', { class: 'note' },
      cfg.optimize ? 'Thứ tự đón trong mỗi chuyến được Google Maps tính lại khi bấm "Tối ưu".' : 'Chưa bật tối ưu Google: thêm GOOGLE_MAPS_API_KEY ở máy chủ. Hiện thứ tự đón theo giờ, bấm link bản đồ để Google chỉ đường.',
      ' Đơn cùng khu vực, lệch tối đa 30 phút được ghép một xe (tối đa 16 khách). "Áp dụng" sẽ ghi đè xe đã gán của các đơn trong ngày.');
    const byVeh = {};
    plan.runs.forEach((r) => { if (r.vehicle) (byVeh[r.vehicle.id] ||= []).push(r); });
    const cards = state.vehicles.filter((v) => byVeh[v.id]).map((v) => el('div', { class: 'vcard' },
      el('b', {}, [v.name, v.plate].filter(Boolean).join(' · ')),
      v.driver ? el('span', {}, 'Tài xế: ' + v.driver + (v.phone ? ' · ' + v.phone : '')) : '',
      byVeh[v.id].map(runCard)));
    const warn = plan.unassigned.length ? el('div', { class: 'vcard', style: 'border-color:var(--danger)' },
      el('b', { style: 'color:var(--danger)' }, 'Chưa có xe cho ' + plan.unassigned.length + ' chuyến (hết xe rảnh)'), plan.unassigned.map(runCard)) : '';
    pv.replaceChildren(bar, note, plan.runs.length ? el('div', { class: 'vgrid' }, cards, warn) : el('p', {}, 'Không có đơn nào trong ngày này.'));
  }

  function runCard(r) {
    const stops = runStops(r), o = orderCache[runKey(r)];
    const hh = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    return el('div', { class: 'run' },
      el('b', {}, `${hh(r.start)} · ${r.pax} khách · ${r.zone === 'camranh' ? 'Cam Ranh' : 'Trung tâm'}`),
      el('ol', {}, stops.map((s) => el('li', {}, s.replace(/, (Nha Trang|Cam Ranh)$/, '')))),
      r.bookings.map((b) => el('div', { class: 'who' }, `${b.name} · ID ${b.guest_id || '—'} · ${SOURCE[b.source] || ''} · ${b.pax}`)),
      o && o.minutes ? el('div', { class: 'who' }, `Tổng khoảng ${o.minutes} phút · ${o.km} km (cả vòng từ phòng khám)`) : '',
      el('a', { href: gmaps(stops), target: '_blank', rel: 'noopener' }, 'Mở lộ trình Google Maps'));
  }

  /* ---------- Xe & tài xế ---------- */
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
  async function start() {
    const c = await api('/api/admin/config');
    if (c.ok) cfg = c.data;
    show(true); load();
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('/api/admin/login', 'POST', { user: $('#u').value, password: $('#p').value });
    if (r.ok) { $('#loginErr').textContent = ''; start(); } else $('#loginErr').textContent = r.status === 429 ? 'Thử quá nhiều lần, chờ 15 phút.' : 'Sai tài khoản hoặc mật khẩu.';
  });
  api('/api/admin/me').then((r) => { if (r.data.authed) start(); });
  setInterval(() => { if (!$('#app').classList.contains('hide') && filter !== 'plan') load().catch(() => {}); }, 30000);
})();
