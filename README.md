# HealthCareOAB+ — платформа предиктивной медицины

Проект состоит из **двух независимых частей**:

| Часть | Папка | Технологии | Что это |
|-------|-------|------------|---------|
| **Фронтенд** | корень репозитория | статический HTML / CSS / JS | Лендинг (`index.html`) + демо-дашборд врача (`dashboard.html`) |
| **Бэкенд** | `backend/` | Node 20+, Fastify, Prisma, PostgreSQL, Redis | Production-API: аутентификация, пациенты, оценка рисков, биллинг |

> **Важно:** без входа фронтенд работает в **демо-режиме** на синтетических данных
> (данные никуда не сохраняются — на страницах виден баннер об этом). После входа
> врача (`login.html`) страницы `labs.html` и `predict.html` считают риск на сервере
> и **сохраняют введённые показатели в карту пациента (БД)** через API. Дашборд
> (`dashboard.html`) при активной сессии тянет живых пациентов из `/v1/patients`.

---

## 1. Запуск фронтенда (самое простое)

Фронтенд собирается на **Vite** (Vanilla, без фреймворка): дев-сервер с HMR,
сборка в `dist/`, переменные окружения и code-splitting по страницам.

**Дев-режим (рекомендуется):**

```bash
npm install      # один раз: ставит vite, chart.js, lenis
npm run dev
```

Откроется дев-сервер на <http://localhost:5173>. Перейдите туда в браузере.

> Порт **5173** выбран намеренно: бэкенд слушает **8080**, а `CORS_ORIGINS`
> бэкенда по умолчанию разрешает именно `http://localhost:5173`. Так фронт и бэк
> не конфликтуют по порту и cookie/CORS работают из коробки.

**Прод-сборка:**

```bash
npm run build    # → dist/ (хэшированные ассеты, готово к раздаче CDN/nginx)
npm run preview  # локальный предпросмотр собранного бандла на :5173
```

### Конфигурация адреса API
`api.js` берёт базовый URL в порядке: `window.HC_CONFIG.apiBase` (рантайм-`config.js`,
который Docker перегенерирует из `API_BASE`) → `import.meta.env.VITE_API_BASE`
(билд-тайм env Vite) → `<meta name="hc-api-base">` → дефолт `http://localhost:8080`.

### Зависимости
**Chart.js** и **Lenis** ставятся из npm и бандлятся Vite (раньше лежали в `vendor/`).
Графики и плавный скролл работают офлайн после `npm install`.

Страницы:
- `index.html` — лендинг (анимации, калькулятор риска, тарифы).
- `dashboard.html` — демо-дашборд (таблицы пациентов, графики, сценарное моделирование).
- `predict.html` — **OmniRisk**: универсальный прогноз рисков всех патологий по мультимодальному профилю (6 горизонтов, цифровой двойник, объяснимый ИИ, сценарное вмешательство). Движок (`omnirisk.js`) работает прямо в браузере. Подробности — в [backend/src/modules/prediction/README.md](backend/src/modules/prediction/README.md).

---

## 2. Запуск бэкенда

Бэкенду нужны **PostgreSQL** и **Redis**. Есть два пути.

### Путь А — БД в Docker, API на хосте (проще всего)

```bash
cd backend
docker compose up -d postgres redis      # поднять только БД и кэш
cp .env.example .env                      # DATABASE_URL уже указывает на localhost:5432
npm install
npm run prisma:generate
npm run prisma:deploy                     # применить миграции
npm run db:seed                           # тестовые данные
npm run dev                               # API на http://localhost:8080
```

**Тестовые учётки после сида** (для входа на фронте через `login.html`):

| Роль | Email | Пароль |
|------|-------|--------|
| Врач | `clinician@oab-clinic.demo` | `OabDemo_Clinician_2026!` |
| Владелец | `owner@oab-clinic.demo` | `OabDemo_Owner_2026!` |

Плюс 10 демо-пациентов в организации «Клиника OAB · Demo».

### Путь А+ — весь стек в Docker (API тоже в контейнере)

```bash
cd ..    # в корень репозитория (compose-файл лежит в backend/)
docker compose -f backend/docker-compose.yml up -d --build postgres redis api
# миграции и сид — С ХОСТА против опубликованного порта 5432 (см. оговорку ниже):
cd backend && npx prisma migrate deploy && npx prisma db seed
curl http://localhost:8080/health/ready   # → {"status":"ready","checks":{"database":true,"redis":true}}
```

> **Две оговорки для контейнерного API (уже учтены в репозитории):**
> 1. Prisma-движок собирается под образ `node:20-bookworm-slim` (Debian 12 / OpenSSL 3.0),
>    поэтому в `schema.prisma` задан `binaryTargets = ["native","debian-openssl-3.0.x"]` —
>    без него контейнер `api` падает в crash-loop.
> 2. Прод-образ работает под non-root и не содержит `prisma` CLI, поэтому
>    `prisma migrate deploy`/`db:seed` **изнутри контейнера не выполнить** — запускайте их
>    **с хоста** (порт 5432 опубликован, `.env` уже настроен на `localhost:5432`).

Полный стек с мониторингом (Prometheus/Grafana/Jaeger) **и фронтендом**: `docker compose -f backend/docker-compose.yml up -d`.
Фронтенд поднимется отдельным nginx-контейнером (`web`) на <http://localhost:8081>;
адрес API он берёт из переменной `API_BASE` (см. `frontend.Dockerfile` и `config.js`).

> **Windows:** на этой машине стек работает через **Docker Desktop + WSL2**. `make` не
> установлен — используйте команды `docker compose …` напрямую (как выше). Если `docker`
> не находится в PATH свежего терминала — перезапустите оболочку после установки Docker Desktop.

### Путь Б — без Docker

1. Установите PostgreSQL 16 и Redis 7 локально (или используйте облачные).
2. Скопируйте конфиг и при необходимости поправьте строки подключения:
   ```bash
   cd backend
   cp .env.example .env
   ```
3. Дальше как выше: `npm install` → `prisma:generate` → `prisma:deploy` → `db:seed` → `npm run dev`.

### Проверка

```bash
cd backend
npm test          # backend unit-тесты (live-stack интеграция скипается по умолчанию)
npm run typecheck # проверка типов
npm run smoke     # post-deploy smoke-тест против запущенного API
curl http://localhost:8080/health/live
```

Live-stack интеграция (нужен поднятый Postgres/Redis) — под флагом `RUN_INTEGRATION=1`.
На холодном Windows-хосте поднимите таймаут хука, иначе `beforeAll` не успевает:

```bash
RUN_INTEGRATION=1 npx vitest run test/integration/api.test.ts --hookTimeout=60000
```

Фронтенд-тесты (из корня репозитория): `npm test` — vitest по `test/frontend/`.

---

## Эксплуатация (одной командой)

В корне есть `Makefile` (нужен Docker). Поднимает и проверяет весь стек:

```bash
make bootstrap   # старт → ожидание API → миграции → сид → smoke-тест
make smoke       # post-deploy проверка (/health + логин + данные)
make backup      # дамп БД в ./backups/oab-<timestamp>.sql.gz
make restore FILE=backups/oab-XXXX.sql.gz
make logs        # хвост логов API
make down        # остановить (тома сохраняются)
make help        # все цели
```

**Наблюдаемость** (поднимается вместе со стеком):
- Grafana <http://localhost:3000> — авто-провижн дашборда «HealthCareOAB+ API — RED»
  (`backend/infra/observability/dashboards/oab-api.json`).
- Prometheus <http://localhost:9090> — алерты в `infra/observability/alerts.yml`
  (5xx-рейт, p99-латентность, target down, всплеск ошибок аутентификации).
- Jaeger <http://localhost:16686> — трейсы.

**Прод:** в `backend/infra/k8s/` есть манифесты API (`deployment.yaml`), фронтенда
(`frontend.yaml`) и ночного бэкапа БД (`backup-cronjob.yaml`). Smoke-тест запускайте
как post-deploy-гейт: `SMOKE_BASE_URL=https://api.… node backend/scripts/smoke.mjs`.

> ⚠️ **Безопасность:** локальный `backend/.env` уже содержит свежесгенерированные
> случайные секреты (а не публичные демо-значения). Для **прод-деплоя** генерируйте
> отдельные секреты и держите их в секрет-менеджере (Vault / AWS Secrets Manager),
> а не в файле:
> ```bash
> openssl rand -base64 48   # для JWT_ACCESS_SECRET и JWT_REFRESH_SECRET
> openssl rand -base64 32   # для PHI_ENCRYPTION_KEY
> ```
> Файл `.env` в `.gitignore` — реальные секреты не коммитятся.

---

## Структура

```
.
├── index.html / dashboard.html   # лендинг + дашборд врача
├── login.html                    # вход врача (сессия для серверного режима)
├── labs.html / predict.html      # ввод анализов и OmniRisk-прогноз (сохранение в карту при входе)
├── styles.css / dashboard.css    # стили
├── app.js / dashboard.js / charts.js   # логика фронтенда
├── lib/clinical.js               # маппинг анализов → BiomarkerBody (+ labPanel), покрыт тестами
├── api.js                         # клиент API (адрес см. «Конфигурация адреса API»)
├── public/config.js               # runtime-конфиг (адрес API), не бандлится Vite
├── vite.config.js                 # многостраничная сборка (7 точек входа)
├── package.json                   # npm run dev / build / preview (Vite)
├── frontend.Dockerfile / nginx.conf / docker-entrypoint.sh  # контейнер фронта (multi-stage build)
└── backend/                       # API (см. backend/README.md)
```

---

## 🤖 Для разработчиков (AI Agents)

Проект оптимизирован для работы с ИИ-агентами (например, **Claude Code**).
Стратегия развития — в [STRATEGY.md](STRATEGY.md); правила для агентов и контекст архитектуры — в [AGENTS.md](AGENTS.md).

Чтобы начать работу с проектом через Claude Code:
1. Установите Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Запустите в корне проекта: `claude`

---

## Чего не хватает для «полностью готового» сайта

Фронтенд и бэкенд уже соединены на ключевых сценариях (вход, пациенты, сохранение анализов и прогнозов в БД). Чтобы довести до полноценного продукта:

1. ~~**Связать фронтенд с API.**~~ ✅ Частично готово: при активной сессии `dashboard.html` тянет пациентов из `/v1/patients`, а `labs.html`/`predict.html` считают риск на сервере и сохраняют показатели в карту (`/v1/patients/:id/assessments`). Без сессии — демо-режим на синтетике. Осталось довести живыми данными остальные виджеты дашборда (аналитика/биллинг уже частично на API).
2. ~~**Экран входа.**~~ ✅ Готово: `login.html` + `/v1/auth/login`; access-токен хранится в памяти, refresh — в httpOnly-cookie (см. `api.js`).
3. ~~**Сборка фронтенда.**~~ ✅ Готово: фронт переведён на **Vite** (Vanilla) — bundler, env-переменные (`VITE_API_BASE`), code-splitting по страницам, npm-зависимости вместо `vendor/`.
4. **Развёртывание.** Бэкенд контейнеризован (`Dockerfile`, `docker-compose.yml`, `infra/k8s`), фронтенд можно отдавать через тот же Nginx/CDN.
5. **CI.** Есть `.github/workflows/ci.yml` — убедитесь, что он гоняет `lint + typecheck + test` на каждый PR.
