# HealthCareOAB+ — Архитектура (v2, premium)

## Структура файлов

```
ariadna/
├── Architecture.md
├── index.html              ← премиум landing page
├── dashboard.html          ← интерфейс врача (демо)
├── styles.css              ← единая стилевая система (токены + компоненты)
├── dashboard.css           ← дашборд-специфичные стили (поверх styles.css)
├── app.js                  ← landing: анимации, canvas mesh, live-демо
├── charts.js               ← палитра + Chart.js defaults + sparklines
└── dashboard.js            ← логика дашборда: пациенты, сценарии, графики
```

## Дизайн-концепция: Bio-Tech Precision Dark v2

- **Фон:** `#05070F` (obsidian) + мягкая RGB-шумовая текстура (SVG turbulence)
- **Aurora-градиент:** `#00E5FF → #A78BFA → #FF5E7E` для ключевых акцентов
- **Primary:** `linear-gradient(135deg, #00E5FF, #4AFFAA)` — CTA, KPI, прогресс
- **Semantic:** cyan (info) · mint (ok) · amber (warn) · rose (risk)
- **Типографика:** Space Grotesk (display) · Inter (body) · JetBrains Mono (code/metrics)
- **Стиль:** glassmorphism панели, animated mesh particles, scroll-reveal,
  card spotlight, pulsating status dots, smooth Lenis-скролл

## CSS-токены (styles.css)

```css
--bg-0: #05070F;      --bg-1: #090C18;      --bg-2: #0F1424;
--surface: rgba(255,255,255,0.035);
--surface-hi: rgba(255,255,255,0.065);
--border: rgba(255,255,255,0.07);
--border-hi: rgba(255,255,255,0.14);
--text: #EAF0FA;      --text-2: #A6AFC4;     --text-3: #6B7489;
--cyan: #00E5FF;      --mint: #4AFFAA;
--amber: #FFB547;     --rose: #FF5E7E;       --violet: #A78BFA;
--grad-primary / --grad-aurora / --grad-warm
--radius / --radius-lg / --radius-xl
--ease-out / --ease-in-out
```

## Модули JS

### app.js (landing)
- Lenis smooth scroll + якорные переходы
- `IntersectionObserver` reveal-on-scroll (staggered)
- Interactive canvas particle mesh в hero (притягивается к курсору)
- CountUp для метрик (с поддержкой десятичных)
- Live clinic counter (случайный дрейф)
- Card mouse-spotlight (`--mx`, `--my` CSS vars)
- Live demo: 3 слайдера + 3 чипа → пересчёт профиля рисков с
  анимированным SVG-arc gauge и линейными барами
- Pricing toggle (ежемесячно ↔ ежегодно −25%)
- Progress bars анимация при входе в viewport
- CTA email валидация

### charts.js (shared)
- `Ariadna.COLORS` — единая палитра для Chart.js
- `Ariadna.applyChartDefaults()` — глобальные defaults (тултипы, шрифты, grid)
- `Ariadna.areaGradient()` — вертикальный градиент для area-fill
- `Ariadna.sparkline()` — минимальный SVG-спарклайн для KPI-карточек
- `Ariadna.riskColor(pct)` — семантический цвет по уровню риска

### dashboard.js
- Глобальные обработчики: `toggleSidebar`, `switchPage`, `showToastDB`, `refreshData`
- Синтетический dataset из 10 пациентов
- Таблицы: overview (топ-5 критичных) + полный список с фильтрами/поиском
- Chart.js визуализации:
  - Trend (многолинейный area с фильтрами ССЗ/СД2/Онко)
  - Risk distribution (doughnut)
  - Radar (пациент vs норма по 8 системам)
  - Timeline (прогноз с/без вмешательства)
  - Scenario bars (горизонтальные)
  - Compliance (doughnut)
  - Population bio-age (grouped bars)
  - Economics (area)
- Custom SVG:
  - SHAP-waterfall (модифицируемые факторы подсвечены)
  - Heatmap (возрастные группы × типы рисков)
  - Bio-age animated ring
- Scenario simulator: 5 слайдеров → реальное пересчитывание 3 рисков + бейджа

## Производительность

- `preconnect` для fonts и CDN + `preload` для app.js
- Canvas mesh deps off: mouse-disabled → idle throttle
- Chart.js анимации на mount, disabled на sliders (`update('none')`)
- `prefers-reduced-motion` отключает все анимации
- Статические изображения отсутствуют — всё SVG/CSS → bundle < 100 KB

## Доступность и SEO

- `<meta>` OG + Twitter Card
- JSON-LD `SoftwareApplication` + `AggregateRating`
- Семантическая HTML-разметка (`<nav>`, `<section>`, `<footer>`, `<details>`)
- Focus styles на всех интерактивных элементах
- `aria-label` на кнопках-иконках
- Контраст WCAG AA для тёмной темы
