(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let lang = 'ru';
  try { lang = localStorage.getItem('vx_lang') || ((navigator.language || '').startsWith('vi') ? 'vi' : 'ru'); } catch {}
  if (!I18N[lang]) lang = 'ru';
  const t = (k) => I18N[lang][k] ?? I18N.ru[k] ?? k;
  let pricing = null;

  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('meta.title');
    $('meta[name=description]').content = t('meta.desc');
    $$('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $$('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
    $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    renderPrice();
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

  // Bảng giá (đọc từ /api/pricing, giá null = theo yêu cầu)
  function renderPrice() {
    const body = $('#priceBody');
    if (!pricing || !body) return;
    const fmt = new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : lang === 'ru' ? 'ru-RU' : 'en-US');
    body.innerHTML = '';
    pricing.zones.forEach((z) => {
      const tr = document.createElement('tr');
      const a = document.createElement('td'), b = document.createElement('td');
      a.textContent = t('zone.' + z.id);
      if (z.free_for_patients) {
        const f = document.createElement('span');
        f.className = 'free'; f.textContent = t('price.free');
        a.append(f);
      }
      b.className = 'p';
      b.textContent = z.price == null ? t('price.ask') : fmt.format(z.price) + ' ₫';
      tr.append(a, b); body.append(tr);
    });
  }
  fetch('/api/pricing').then((r) => r.json()).then((p) => { pricing = p; renderPrice(); }).catch(() => {});

  // Form
  const form = $('#bookForm'), result = $('#result'), sur = $('#surcharge'), btn = $('#submitBtn');
  function updateSurcharge() {
    const k = form.kind.value;
    sur.classList.toggle('show', k !== 'clinic');
    sur.textContent = k === 'clinic' ? '' : t('sur.' + k);
  }
  $$('input[name=kind]').forEach((r) => r.addEventListener('change', updateSurcharge));

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
        result.textContent = t('ok').replace('{ref}', j.ref || '');
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
