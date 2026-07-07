# 0005 — Строгий CSP без `'unsafe-inline'`

- Статус: Accepted
- Дата: 2026-06

## Контекст

Фронт работает с PHI; XSS/инъекции — приоритетная угроза. Изначально разметка
содержала inline `onclick`, inline `style=`, inline `<style>`/`<script>` и внешние
шрифты Google — всё это требовало `script-src`/`style-src 'unsafe-inline'` и внешних
origin, что резко ослабляет CSP.

## Решение

Политика: `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self';
img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';
form-action 'self'; connect-src <origin из $API_BASE>`. Чтобы это стало возможным:

- **script-src** — inline `on*`-обработчики → делегирование по `data-action`
  (`document`-listener); inline `<script type=module>`-glue → реальные модули
  (`vendor-chart.js`, `cox.js`, импорт Lenis в `app.js`). JSON-LD не исполняется.
- **style-src** — inline `style=` → CSS-классы; inline `<style>` → внешние `.css`;
  динамика (цвет риска, ширина бара) → `data-sty` + CSSOM (`lib/dom.js`), т.к.
  присвоение `element.style` из JS CSP не запрещает.
- **font-src** — шрифты self-hosted (`@fontsource` variable, бандлит Vite); Google CDN убран.
- **connect-src** — `docker-entrypoint.sh` выводит `'self' <origin($API_BASE)>` из того
  же env, что и рантайм-конфиг ([ADR-0007](0007-runtime-config.md)); переопределяется `$CSP_CONNECT_SRC`.

## Последствия

- **+** Инъектированный inline-скрипт/стиль/обработчик не исполняется; поверхность XSS резко уже.
- **+** Нет внешних origin для шрифтов/стилей → меньше сторонних зависимостей и RTT.
- **−** Динамические стили идут через хелпер `applyDynamicStyles`/`observeDynamicStyles`
  (`data-sty`), а не inline — небольшой рантайм-оверхед и дисциплина разметки.
- Проверка эмиссии заголовка nginx — в CI/деплое (локально нет Docker).
