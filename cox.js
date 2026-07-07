/* ============================================================
   Модель Кокса — научная страница (cox.html)
   ------------------------------------------------------------
   Появление блоков при скролле — на getBoundingClientRect (без зависимости от
   IntersectionObserver, который не везде надёжно срабатывает). Контент виден
   по умолчанию; анимацию включаем, только если уважение к motion позволяет.

   Вынесено из inline <script> в отдельный модуль, чтобы CSP мог обойтись без
   script-src 'unsafe-inline'.
   ============================================================ */
import './lib/telemetry.js';
import { initI18n } from './lib/i18n.js';

'use strict';

initI18n(); // RU по умолчанию; переключатель [data-lang-toggle] в навигации
const root = document.documentElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const els = [...document.querySelectorAll('.reveal')];

if (!reduce) {
  root.classList.add('js'); // переводит .reveal в скрытое состояние (см. CSS)
  let raf = 0;
  const reveal = () => {
    raf = 0;
    const vh = window.innerHeight || 800;
    for (const el of els) {
      if (el.classList.contains('in')) continue;
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add('in');
    }
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(reveal); };
  reveal(); // первый проход — показать всё, что уже в зоне видимости
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('load', reveal);
  setTimeout(reveal, 350); // после подгрузки шрифтов/раскладки
  // Страховка: что бы ни случилось — через 2.5 с показываем всё.
  setTimeout(() => els.forEach((el) => el.classList.add('in')), 2500);
}
