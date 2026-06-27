# HealthCareOAB+ — платформа предиктивной медицины

Проект состоит из **двух независимых частей**:

| Часть | Папка | Технологии | Что это |
|-------|-------|------------|---------|
| **Фронтенд** | корень репозитория | статический HTML / CSS / JS | Лендинг (`index.html`) + демо-дашборд врача (`dashboard.html`) |
| **Бэкенд** | `backend/` | Node 20+, Fastify, Prisma, PostgreSQL, Redis | Production-API: аутентификация, пациенты, оценка рисков, биллинг |

> **Важно:** сейчас фронтенд работает на **синтетических данных** и не обращается к бэкенду. Это две самостоятельные части, которые запускаются по отдельности (см. ниже «Чего не хватает»).

---

## 1. Запуск фронтенда (самое простое)

Фронтенд — это обычные статические файлы. Достаточно отдать их по HTTP.

**Вариант А — одной командой (рекомендуется):**

```bash
npm start
```

Откроется статический сервер на <http://localhost:5173>. Перейдите туда в браузере.

> Порт **5173** выбран намеренно: бэкенд слушает **8080**, а `CORS_ORIGINS`
> бэкенда по умолчанию разрешает именно `http://localhost:5173`. Так фронт и бэк
> не конфликтуют по порту и cookie/CORS работают из коробки.

**Вариант Б — любой статический сервер:**

```bash
npx serve -l 5173 .
# или
python -m http.server 5173
```

**Вариант В — просто открыть файл.** Можно дважды кликнуть `index.html`. Страница откроется, но запуск через сервер надёжнее (некоторые браузеры ограничивают `file://`).

### Почему «не работало» раньше
- Библиотеки **Chart.js** и **Lenis** грузились с интернет-CDN. Без интернета графики на дашборде не отрисовывались, и казалось, что «ничего не работает». Теперь они лежат локально в `vendor/` и работают офлайн.
- В корне не было ни `README`, ни команды запуска — было непонятно, с чего начинать. Теперь есть `npm start`.

Страницы:
- `index.html` — лендинг (анимации, калькулятор риска, тарифы).
- `dashboard.html` — демо-дашборд (таблицы пациентов, графики, сценарное моделирование).
- `predict.html` — **OmniRisk**: универсальный прогноз рисков всех патологий по мультимодальному профилю (6 горизонтов, цифровой двойник, объяснимый ИИ, сценарное вмешательство). Движок (`omnirisk.js`) работает прямо в браузере. Подробности — в [backend/src/modules/prediction/README.md](backend/src/modules/prediction/README.md).

---

## 2. Запуск бэкенда

Бэкенду нужны **PostgreSQL** и **Redis**. Есть два пути.

### Путь А — через Docker (проще всего)

```bash
cd backend
docker compose up -d postgres redis      # поднять только БД и кэш
npm install
npm run prisma:generate
npm run prisma:deploy                     # применить миграции
npm run db:seed                           # тестовые данные
npm run dev                               # API на http://localhost:8080
```

Полный стек с мониторингом (Prometheus/Grafana/Jaeger) **и фронтендом**: `docker compose up -d`.
Фронтенд поднимется отдельным nginx-контейнером (`web`) на <http://localhost:8081>;
адрес API он берёт из переменной `API_BASE` (см. `frontend.Dockerfile` и `config.js`).

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
npm test          # 38 unit-тестов
npm run typecheck # проверка типов
npm run smoke     # post-deploy smoke-тест против запущенного API
curl http://localhost:8080/health/live
```

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
├── index.html / dashboard.html   # страницы
├── styles.css / dashboard.css    # стили
├── app.js / dashboard.js / charts.js   # логика фронтенда
├── api.js / config.js            # клиент API + runtime-конфиг (адрес API)
├── vendor/                        # локальные Chart.js и Lenis (офлайн)
├── package.json                   # npm start → статический сервер (:5173)
├── frontend.Dockerfile / nginx.conf / docker-entrypoint.sh  # контейнер фронта
└── backend/                       # API (см. backend/README.md)
```

---

## 🤖 Для разработчиков (AI Agents)

Проект оптимизирован для работы с ИИ-агентами (например, **Claude Code**).
Все инструкции по "Deep Planning Mode" и специфике архитектуры находятся в файле [AGENTS.md](AGENTS.md).

Чтобы начать работу с проектом через Claude Code:
1. Установите Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Запустите в корне проекта: `claude`

---

## Чего не хватает для «полностью готового» сайта

Код фронтенда и бэкенда исправен, но это пока две несоединённые части. Чтобы получить настоящий продукт:

1. **Связать фронтенд с API.** Сейчас дашборд показывает захардкоженные данные (`PATIENTS` в `dashboard.js`). Нужно заменить их на `fetch('/v1/patients', { headers: { Authorization: ... }})`.
2. **Экран входа.** У бэкенда есть `/v1/auth/login`, но на фронте нет формы логина и хранения токена.
3. **Сборка фронтенда.** Для роста проекта стоит перейти на Vite/React, чтобы был bundler, env-переменные и code-splitting.
4. **Развёртывание.** Бэкенд контейнеризован (`Dockerfile`, `docker-compose.yml`, `infra/k8s`), фронтенд можно отдавать через тот же Nginx/CDN.
5. **CI.** Есть `.github/workflows/ci.yml` — убедитесь, что он гоняет `lint + typecheck + test` на каждый PR.
