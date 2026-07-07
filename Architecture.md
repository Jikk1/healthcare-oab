# HealthCareOAB+ — Frontend Architecture

> Обзор фронтенда. Бэкенд описан отдельно в [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md).
> Ключевые решения зафиксированы как ADR в [`docs/adr/`](docs/adr/).

## 1. Обзор

Многостраничное приложение (MPA) на **Vanilla JS + Vite**. Пять публичных
маркетинговых/научных страниц + инструменты (OmniRisk, «Анализы») + кабинет врача
(дашборд) + вход. Сборка Vite даёт code-splitting по страницам, npm-зависимости и
хэшированные ассеты; рантайм — обычный ES-модуль без фреймворка (см. [ADR-0001](docs/adr/0001-vite-vanilla.md)).

Дизайн-принцип рантайма — **прогрессивное улучшение** ([ADR-0004](docs/adr/0004-progressive-enhancement.md)):
каждая страница работает как самодостаточное демо (расчёты в браузере, синтетические
данные), а при наличии сессии подтягивает живые данные из API.

## 2. Страницы (точки входа Vite)

| Страница | Сущность | Entry JS | CSS |
|---|---|---|---|
| `index.html` | Лендинг | `app.js` | `styles.css` |
| `cox.html` | Научная страница (модель Кокса) | `cox.js` | `cox.css` |
| `cox-demo.html` | Живое демо движка Кокса | `cox-demo.js` | `cox.css` |
| `predict.html` | OmniRisk (слайдеры) | `predict.js` (+`omnirisk.js`) | `styles.css`+`dashboard.css`+`predict.css` |
| `labs.html` | Ввод анализов → прогноз | `labs.js` (+`omnirisk.js`) | `styles.css`+`dashboard.css`+`labs.css` |
| `dashboard.html` | Кабинет врача | `dashboard.js` (+`charts.js`,`api.js`) | `styles.css`+`dashboard.css` |
| `login.html` | Вход | `login.js` (+`api.js`) | `styles.css`+`login.css` |

Входные HTML перечислены в `vite.config.js`; JS/CSS, на которые они ссылаются,
Vite обнаруживает и бандлит автоматически.

## 3. Общие модули

- **`api.js`** — тонкий клиент над `fetch` для `/v1`. Разворачивает конверт
  `{data|error, meta}`, кидает `ApiError`, при 401 один раз обновляет access-токен
  по refresh-cookie. Access-токен живёт **только в памяти вкладки**, не в
  localStorage ([ADR-0003](docs/adr/0003-token-in-memory.md)). База API — из
  `window.HC_CONFIG.apiBase` (рантайм `/config.js`) → `import.meta.env.VITE_API_BASE`
  → `<meta name="hc-api-base">`.
- **`omnirisk.js`** — детерминированный браузерный движок рисков (используется
  predict/labs). Чистые функции, покрыты тестами.
- **`charts.js`** — палитра `window.Ariadna.*` + defaults Chart.js + sparklines
  (дашборд). Chart.js подаётся как `window.Chart` через `vendor-chart.js`.
- **`vendor-chart.js`** — `import Chart from 'chart.js/auto'; window.Chart = Chart`
  (реальный модуль вместо inline `<script>` ради CSP; см. [ADR-0005](docs/adr/0005-strict-csp.md)).
- **`lib/`** — переиспользуемое, покрытое тестами:
  - `clinical.js` — референсные диапазоны, статусы полей, маппинг биомаркеров.
  - `format.js` — `escapeHtml` (защита от stored-XSS во всех innerHTML-стоках).
  - `dom.js` — `applyDynamicStyles`/`observeDynamicStyles`: динамические стили через
    CSSOM из `data-sty` (CSP без `style-src 'unsafe-inline'`).
  - `i18n.js` — рантайм-переключение RU/EN ([ADR-0008](docs/adr/0008-i18n.md)).
  - `telemetry.js` — перехват ошибок + Core Web Vitals (side-effect импорт в каждой странице).
- **`locales/en.js`** — EN-словарь для i18n (RU — источник в разметке).

## 4. Безопасность и соответствие (реализовано)

- **CSP без `'unsafe-inline'`** ни в `script-src`, ни в `style-src` ([ADR-0005](docs/adr/0005-strict-csp.md)).
  Inline-обработчики → делегирование по `data-action`; inline-стили → CSS-классы;
  динамика → `data-sty`+CSSOM; шрифты — self-hosted (`@fontsource`), внешних origin нет.
  `connect-src` выводится на старте контейнера из `$API_BASE`.
- **XSS** — `escapeHtml` на всех user/PHI innerHTML-стоках.
- **Заголовки** — HSTS, COOP, nosniff, X-Frame-Options, Permissions-Policy,
  Referrer-Policy (`security-headers.conf.template`, рендерится entrypoint'ом).

## 5. Доступность / SEO / перф

- **A11y (WCAG AA)** — скип-ссылки, фокусируемые `main`-landmarks, `:focus-visible`,
  `aria-label` на иконочных кнопках, `aria-live` на динамических регионах,
  `prefers-reduced-motion`.
- **SEO** — `public/robots.txt` + `public/sitemap.xml`, per-page canonical/OG/Twitter,
  `noindex` на dashboard/login, JSON-LD `SoftwareApplication` на лендинге.
- **Перф** — self-hosted subset-woff2 (нет внешнего RTT), Chart.js/Lenis из npm,
  анимации off на слайдерах и при reduced-motion, ассеты < ~100 KB (без Chart).

## 6. Развёртывание

Vite build → `dist/` раздаётся rootless-nginx (`frontend.Dockerfile`).
`docker-entrypoint.sh` на старте контейнера генерирует `/config.js` из `$API_BASE`
([ADR-0007](docs/adr/0007-runtime-config.md)) и рендерит CSP `connect-src`. k8s-манифест —
`backend/infra/k8s/frontend.yaml`.

## 7. Дизайн-токены (styles.css)

Тёмная тема «Bio-Tech Precision»: фон `#05070F`, aurora-градиент
`#00E5FF → #A78BFA → #FF5E7E`, семантические cyan/mint/amber/rose. Шрифты —
Space Grotesk (display) · Inter (body) · JetBrains Mono (mono), self-hosted variable.
