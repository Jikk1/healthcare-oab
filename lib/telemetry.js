/* ============================================================
   HealthCareOAB+ — клиентская телеметрия (perf + ошибки)
   ------------------------------------------------------------
   Побочный импорт: подключается в начале каждой страницы-энтри
   (`import './lib/telemetry.js'`). Без внешних зависимостей.

   - Глобальный перехват ошибок (error + unhandledrejection).
   - Core Web Vitals через PerformanceObserver (LCP, CLS, INP, TTFB, FCP).

   По умолчанию только пишет в консоль. Если задан window.HC_CONFIG.telemetryUrl,
   дополнительно шлёт компактный JSON через navigator.sendBeacon. PII не собираем.
   ============================================================ */
(() => {
  if (typeof window === 'undefined') return;
  const endpoint = (window.HC_CONFIG && window.HC_CONFIG.telemetryUrl) || null;

  const send = (type, payload) => {
    if (type === 'error') console.error('[telemetry]', payload);
    else if (console.debug) console.debug('[telemetry]', type, payload);
    if (endpoint && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(
          endpoint,
          JSON.stringify({ type, page: location.pathname, ts: Date.now(), ...payload }),
        );
      } catch { /* телеметрия не должна ронять приложение */ }
    }
  };

  /* ---------- Перехват ошибок ---------- */
  window.addEventListener('error', (e) => {
    send('error', {
      message: String(e.message || ''),
      source: e.filename, line: e.lineno, col: e.colno,
      stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 600) : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    send('error', {
      message: 'unhandledrejection: ' + ((r && r.message) || String(r)),
      stack: r && r.stack ? String(r.stack).slice(0, 600) : undefined,
    });
  });

  /* ---------- Core Web Vitals ---------- */
  const observe = (type, cb) => {
    try {
      const po = new PerformanceObserver((list) => list.getEntries().forEach(cb));
      po.observe({ type, buffered: true });
      return po;
    } catch { return null; }
  };

  let lcp = 0, cls = 0, inp = 0;
  observe('largest-contentful-paint', (e) => { lcp = e.startTime; });
  observe('layout-shift', (e) => { if (!e.hadRecentInput) cls += e.value; });
  observe('event', (e) => { if (e.duration > inp) inp = e.duration; });

  // Финальный замер — когда вкладка уходит в фон (стандартная точка для Web Vitals).
  const report = () => {
    if (document.visibilityState !== 'hidden') return;
    document.removeEventListener('visibilitychange', report);
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    send('web-vitals', {
      lcp: Math.round(lcp),
      cls: Math.round(cls * 1000) / 1000,
      inp: Math.round(inp),
      ttfb: nav ? Math.round(nav.responseStart) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
    });
  };
  document.addEventListener('visibilitychange', report);
})();
