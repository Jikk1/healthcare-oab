/* ============================================================
   HealthCareOAB+ — Landing interactions
   ============================================================ */
(() => {
  'use strict';

  /* ---------- Preloader ---------- */
  const hidePreloader = () => {
    const pre = document.getElementById('preloader');
    if (!pre) return;
    setTimeout(() => pre.classList.add('done'), 400);
  };
  window.addEventListener('load', hidePreloader);
  setTimeout(hidePreloader, 2000);

  /* ---------- Lenis smooth scroll (optional) ---------- */
  let lenis = null;
  if (window.Lenis) {
    lenis = new window.Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.4,
    });
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);

    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id === '#') return;
        const el = document.querySelector(id);
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: -90 });
      });
    });
  }

  /* ---------- Navbar scroll state ---------- */
  const nav = document.getElementById('nav');
  const onScroll = () => {
    if (!nav) return;
    if (window.scrollY > 20) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  const menuBtn = document.getElementById('menuBtn');
  const mobileNav = document.getElementById('mobileNav');
  if (menuBtn && mobileNav) {
    menuBtn.addEventListener('click', () => mobileNav.classList.toggle('open'));
    mobileNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => mobileNav.classList.remove('open')));
  }

  /* ---------- Reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* ---------- Card spotlight (mouse-follow) ---------- */
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ---------- CountUp for metrics ---------- */
  const countUp = (el, to, opts = {}) => {
    const { prefix = '', suffix = '', duration = 1400, decimals = 0 } = opts;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const v = to * ease(p);
      el.textContent = prefix + (decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('ru-RU')) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const countUpIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const to = parseFloat(el.dataset.count);
      countUp(el, to, {
        prefix: el.dataset.prefix || '',
        suffix: el.dataset.suffix || '',
        decimals: parseInt(el.dataset.decimals || 0, 10),
      });
      countUpIO.unobserve(el);
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('[data-count]').forEach((el) => countUpIO.observe(el));

  /* ---------- Live clinic counter ---------- */
  const liveEl = document.getElementById('liveCount');
  if (liveEl) {
    let n = 143;
    setInterval(() => {
      const delta = Math.floor(Math.random() * 5) - 2;
      n = Math.max(140, Math.min(165, n + delta));
      liveEl.textContent = n;
    }, 4800);
  }

  /* ---------- Hero canvas: animated particle mesh (DNA-like) ---------- */
  const cnv = document.getElementById('heroCanvas');
  if (cnv && cnv.getContext) {
    const ctx = cnv.getContext('2d');
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nodes = [];
    const NODE_COUNT = 48;

    const resize = () => {
      const rect = cnv.getBoundingClientRect();
      w = rect.width; h = rect.height;
      cnv.width = w * dpr; cnv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const init = () => {
      nodes.length = 0;
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.5 + 0.6,
        });
      }
    };
    let mouse = { x: -9999, y: -9999 };
    cnv.addEventListener('pointermove', (e) => {
      const r = cnv.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    });
    cnv.addEventListener('pointerleave', () => { mouse.x = -9999; mouse.y = -9999; });

    const render = () => {
      ctx.clearRect(0, 0, w, h);

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        const dx = mouse.x - n.x, dy = mouse.y - n.y;
        const d = Math.hypot(dx, dy);
        if (d < 140) {
          n.vx += (-dx / d) * 0.02;
          n.vy += (-dy / d) * 0.02;
        }
        n.vx *= 0.99; n.vy *= 0.99;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 140) {
            const alpha = (1 - d / 140) * 0.4;
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 4);
        grad.addColorStop(0, 'rgba(0, 229, 255, 0.9)');
        grad.addColorStop(1, 'rgba(0, 229, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7DF6FF';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(render);
    };
    resize(); init(); render();
    window.addEventListener('resize', () => { resize(); init(); });
  }

  /* ---------- Interactive risk gauge (SVG arc) ---------- */
  const gauge = document.getElementById('gauge');
  const gaugeValueEl = document.getElementById('gaugeValue');
  const ccsEl = document.getElementById('ccs');
  const metEl = document.getElementById('met');
  const oncoEl = document.getElementById('onco');
  const neuroEl = document.getElementById('neuro');
  const totalEl = document.getElementById('totalRisk');

  const ageS = document.getElementById('ageS');
  const bpS = document.getElementById('bpS');
  const chS = document.getElementById('chS');
  const smokeC = document.getElementById('smokeC');
  const statC = document.getElementById('statC');
  const sportC = document.getElementById('sportC');

  const ageV = document.getElementById('ageV');
  const bpV = document.getElementById('bpV');
  const chV = document.getElementById('chV');

  const setArc = (v) => {
    if (!gauge) return;
    const arc = gauge.querySelector('.arc-fg');
    if (!arc) return;
    const r = 90;
    const full = Math.PI * r * 1.5;
    arc.style.strokeDasharray = full;
    arc.style.strokeDashoffset = full - (v / 100) * full;
    const stops = gauge.querySelectorAll('#garcGrad stop');
    if (stops.length && v > 65) {
      stops[0].setAttribute('stop-color', '#FF5E7E');
      stops[1].setAttribute('stop-color', '#FFB547');
    } else if (stops.length && v > 35) {
      stops[0].setAttribute('stop-color', '#FFB547');
      stops[1].setAttribute('stop-color', '#4AFFAA');
    } else if (stops.length) {
      stops[0].setAttribute('stop-color', '#00E5FF');
      stops[1].setAttribute('stop-color', '#4AFFAA');
    }
  };
  const setBar = (el, pct, cls) => {
    if (!el) return;
    const fill = el.querySelector('.fill');
    const num = el.querySelector('.pct');
    fill.style.width = `${Math.min(100, pct)}%`;
    num.textContent = `${pct.toFixed(1)}%`;
    el.classList.remove('high', 'critical');
    if (pct > 65) el.classList.add('critical');
    else if (pct > 35) el.classList.add('high');
  };

  const computeRisks = () => {
    if (!ageS) return;
    const age = parseInt(ageS.value, 10);
    const bp = parseInt(bpS.value, 10);
    const ch = parseFloat(chS.value);
    const smoke = smokeC.classList.contains('on') ? 1 : 0;
    const stat = statC.classList.contains('on') ? 1 : 0;
    const sport = sportC.classList.contains('on') ? 1 : 0;

    if (ageV) ageV.textContent = age + ' лет';
    if (bpV) bpV.textContent = bp;
    if (chV) chV.textContent = ch.toFixed(1);

    const ageF = Math.max(0, (age - 30) * 0.55);
    const bpF = Math.max(0, (bp - 120) * 0.28);
    const chF = Math.max(0, (ch - 4.5) * 3.4);
    const smokeF = smoke ? 16 : 0;
    const statF = stat ? -9 : 0;
    const sportF = sport ? -5 : 0;

    let ccs = Math.max(1, Math.min(94, ageF + bpF + chF + smokeF + statF + sportF));
    let met = Math.max(1, Math.min(90, ageF * 0.8 + bpF * 0.5 + chF * 0.6 + smokeF * 0.4 + statF + sportF * 1.2));
    let onco = Math.max(1, Math.min(80, ageF * 1.1 + smokeF * 0.8 + sportF * 0.6));
    let neuro = Math.max(1, Math.min(78, ageF * 0.7 + bpF * 0.4 + sportF * 0.8 + statF * 0.3));

    const total = Math.round((ccs * 0.38 + met * 0.26 + onco * 0.22 + neuro * 0.14));

    setArc(total);
    if (gaugeValueEl) gaugeValueEl.textContent = total + '%';
    if (totalEl) totalEl.textContent = total + '%';

    setBar(ccsEl, ccs);
    setBar(metEl, met);
    setBar(oncoEl, onco);
    setBar(neuroEl, neuro);
  };

  [ageS, bpS, chS].forEach((s) => s && s.addEventListener('input', computeRisks));
  [smokeC, statC, sportC].forEach((c) => c && c.addEventListener('click', () => { c.classList.toggle('on'); computeRisks(); }));
  computeRisks();

  /* ---------- Roadmap progress bars (animate on view) ---------- */
  const barsIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const to = el.dataset.progress || '0';
      el.style.width = to + '%';
      barsIO.unobserve(el);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.bar > i').forEach((el) => barsIO.observe(el));

  /* ---------- Pricing toggle ---------- */
  const tMo = document.getElementById('tMo');
  const tYr = document.getElementById('tYr');
  const priceBasic = document.getElementById('priceBasic');
  const pricePro = document.getElementById('pricePro');
  const periodBasic = document.getElementById('periodBasic');
  const periodPro = document.getElementById('periodPro');

  const setBilling = (yearly) => {
    if (!tMo || !tYr) return;
    tMo.classList.toggle('active', !yearly);
    tYr.classList.toggle('active', yearly);
    if (yearly) {
      if (priceBasic) priceBasic.innerHTML = '₽21 750<small>/мес</small>';
      if (pricePro) pricePro.innerHTML = '₽59 250<small>/мес</small>';
      if (periodBasic) periodBasic.textContent = '₽261 000 в год · экономия ₽87 000';
      if (periodPro) periodPro.textContent = '₽711 000 в год · экономия ₽237 000';
    } else {
      if (priceBasic) priceBasic.innerHTML = '₽29 000<small>/мес</small>';
      if (pricePro) pricePro.innerHTML = '₽79 000<small>/мес</small>';
      if (periodBasic) periodBasic.textContent = 'в месяц · до 500 пациентов';
      if (periodPro) periodPro.textContent = 'в месяц · без ограничений';
    }
  };
  if (tMo) tMo.addEventListener('click', () => setBilling(false));
  if (tYr) tYr.addEventListener('click', () => setBilling(true));

  /* ---------- CTA form ---------- */
  const ctaBtn = document.getElementById('ctaBtn');
  const ctaEmail = document.getElementById('ctaEmail');
  if (ctaBtn && ctaEmail) {
    ctaBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const v = (ctaEmail.value || '').trim();
      if (!v.includes('@')) {
        ctaEmail.style.borderColor = 'var(--rose)';
        ctaEmail.focus();
        setTimeout(() => { ctaEmail.style.borderColor = ''; }, 2000);
        return;
      }
      ctaBtn.innerHTML = '<span>✓</span> Заявка принята';
      ctaBtn.style.background = 'linear-gradient(135deg, #4AFFAA, #00E5FF)';
      ctaEmail.value = '';
      setTimeout(() => {
        ctaBtn.innerHTML = '<span>→</span> Начать бесплатно';
        ctaBtn.style.background = '';
      }, 3500);
    });
  }

  /* ---------- Dynamic year ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
