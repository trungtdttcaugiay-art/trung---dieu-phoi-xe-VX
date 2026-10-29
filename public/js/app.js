(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let lang = 'ru';
  try { lang = localStorage.getItem('vx_lang') || ((navigator.language || '').startsWith('vi') ? 'vi' : 'ru'); } catch {}
  if (!I18N[lang]) lang = 'ru';
  const t = (k) => I18N[lang][k] ?? I18N.ru[k] ?? k;

  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('meta.title');
    $('meta[name=description]').content = t('meta.desc');
    $$('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
    $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    $$('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    renderHotels();
    if (typeof renderChips === 'function') { renderChips(); renderFleet(); }
    updateSurcharge();
    try { localStorage.setItem('vx_lang', lang); } catch {}
  }

  $$('.lang button').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; applyLang(); }));

  // Menu mobile
  const menuBtn = $('#menuBtn'), nav = $('#nav');
  menuBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  $$('#nav a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }));

  // Gợi ý khách sạn (trung tâm Nha Trang + Cam Ranh), nhãn theo ngôn ngữ đang chọn
  function renderHotels() {
    const dl = $('#hotelList');
    if (!dl || !window.HOTELS) return;
    dl.replaceChildren();
    [['center', 'hotel.center'], ['camranh', 'hotel.camranh']].forEach(([zone, key]) => {
      (HOTELS[zone] || []).forEach((name) => {
        const o = document.createElement('option');
        o.value = name; o.label = t(key);
        dl.append(o);
      });
    });
  }

  // Bản đồ Google (nhúng không cần API key)
  let clinicQuery = 'Phòng khám nha khoa quốc tế Việt Xô Nha Trang';
  const mapFrame = $('#mapFrame'), mapOpen = $('#mapOpen'), chips = $('#mapChips');
  const mapSrc = (q) => `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed&hl=${lang}`;
  const mapLink = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  function showMap(q, btn) {
    mapFrame.src = mapSrc(q);
    mapOpen.href = mapLink(q);
    $$('.chip', chips).forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
  }
  function renderChips() {
    chips.replaceChildren();
    const add = (label, q, first) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = label;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => showMap(q, b));
      chips.append(b);
      if (first) showMap(q, b);
    };
    add(t('map.clinic'), clinicQuery, true);
    (HOTELS.center || []).forEach((n) => add(n, n + ', Nha Trang'));
    (HOTELS.camranh || []).forEach((n) => add(n, n + ', Cam Ranh'));
  }
  fetch('/api/config').then((r) => r.json()).then((c) => { if (c.clinicQuery) { clinicQuery = c.clinicQuery; renderChips(); } }).catch(() => {});
  renderChips();

  // Danh sách xe: chỉ hiện xe đã có biển số hoặc tài xế
  let fleet = [];
  function renderFleet() {
    const box = $('#fleetList');
    box.replaceChildren();
    fleet.forEach((v) => {
      const c = document.createElement('div'); c.className = 'fcard';
      const h = document.createElement('b'); h.textContent = v.name; c.append(h);
      const row = (label, val) => { const p = document.createElement('span'); p.textContent = `${label}: ${val}`; c.append(p); };
      if (v.plate) row(t('fleet.plate'), v.plate);
      if (v.driver) row(t('fleet.driver'), v.driver);
      if (v.phone) {
        const a = document.createElement('a');
        a.href = 'tel:' + v.phone.replace(/[^\d+]/g, ''); a.textContent = v.phone;
        c.append(a);
      }
      box.append(c);
    });
  }
  fetch('/api/fleet').then((r) => r.json()).then((f) => { fleet = f; renderFleet(); }).catch(() => {});

  // Form
  const form = $('#bookForm'), result = $('#result'), sur = $('#surcharge'), btn = $('#submitBtn');
  function updateSurcharge() {
    const k = form.kind.value;
    sur.classList.toggle('show', k !== 'clinic');
    sur.textContent = k === 'clinic' ? '' : t('sur.' + k);
  }
  $$('input[name=kind]').forEach((r) => r.addEventListener('change', updateSurcharge));

  const hotelMap = $('#hotelMap');
  form.hotel.addEventListener('input', () => {
    const v = form.hotel.value.trim();
    hotelMap.hidden = !v;
    if (v) hotelMap.href = mapLink(v + ', Nha Trang');
  });

  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  form.pickup_at.min = local;

  function setErr(input, msg) {
    const f = input.closest('.field');
    f.classList.toggle('err', !!msg);
    const m = $('.msg', f);
    if (m) m.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validate() {
    let bad = null;
    [['name', 'v.required'], ['pickup', 'v.required'], ['pickup_at', 'v.required']].forEach(([n, m]) => {
      const bl = !form[n].value.trim(); setErr(form[n], bl ? t(m) : ''); if (bl && !bad) bad = form[n];
    });
    const phoneBad = form.phone.value.replace(/\D/g, '').length < 7;
    setErr(form.phone, phoneBad ? t('v.phone') : ''); if (phoneBad && !bad) bad = form.phone;
    if (bad) bad.focus();
    return !bad;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    result.className = 'result';
    if (!validate()) return;
    const data = Object.fromEntries(new FormData(form));
    data.lang = lang;
    btn.disabled = true; const old = btn.textContent; btn.textContent = t('sending');
    try {
      const r = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        result.className = 'result ok';
        result.textContent = t('ok').replace('{ref}', j.ref || '').replace('{gid}', j.guest_id || '');
        form.reset(); updateSurcharge();
      } else {
        result.className = 'result bad';
        result.textContent = j.error === 'past' ? t('err.past') : t('err');
      }
    } catch {
      result.className = 'result bad'; result.textContent = t('err');
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  });

  // Reveal on scroll
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    $$('.rv').forEach((el) => io.observe(el));
  } else $$('.rv').forEach((el) => el.classList.add('in'));

  applyLang();
})();
