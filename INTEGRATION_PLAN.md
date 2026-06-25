# План склейки фронтенда и бэкенда

Статус: фронт (`index.html`, `dashboard.html`, `predict.html`) работает на синтетике;
бэкенд (`backend/`, Fastify `/v1`) — отдельно. Цель — соединить их через auth + `fetch`.
Весь контракт ниже подтверждён по коду бэкенда, а не по памяти.

---

## Подтверждённый контракт API

### Логин — `POST /v1/auth/login`
Тело: `{ email, password }` ([backend/src/modules/auth/auth.routes.ts](backend/src/modules/auth/auth.routes.ts)).
Ответ:
```json
{ "data": { "user", "organization", "role",
            "accessToken", "accessExpiresIn",
            "refreshToken", "refreshExpiresAt" },
  "meta": { "requestId" } }
```
- Refresh-токен **дополнительно** кладётся в httpOnly-cookie `hcoab_rt` на путь `/v1/auth`.
- Значит `POST /v1/auth/refresh` браузер вызывает **без тела** (cookie подхватится сама),
  если запрос идёт с `credentials: 'include'`.
- Access-токен хранить **только в памяти вкладки** (не в `localStorage` — XSS).

### Список пациентов — `GET /v1/patients?page&pageSize&level&archived&search`
Требует `Authorization: Bearer <accessToken>`. Ответ — пагинированный конверт:
```json
{ "data": { "items": [PatientDto], "page", "pageSize", "total", "totalPages" },
  "meta": { "requestId" } }
```

### Маппинг `PatientDto` → строка `PATIENTS` (dashboard.js)
| Фронт | Сервер (`PatientDto`) | Преобразование |
|---|---|---|
| `name` | `fullName` | как есть |
| `initials` | `initials` | как есть |
| `sex` `Муж/Жен` | `sex` `MALE/FEMALE/OTHER` | мапа `{MALE:'Муж', FEMALE:'Жен'}` |
| `age` | `ageYears` | как есть |
| `cv` | `latestCvRisk` | `null` → «нет данных» |
| `dm` | `latestDmRisk` | `null` → «нет данных» |
| `bio` | `latestBioAge` | `null` → «нет данных» |
| `level` `critical/high/medium/low` | `latestRiskLevel` `LOW/MEDIUM/HIGH/CRITICAL` | `.toLowerCase()` |

Адаптер уже реализован: `HCApi.adapters.patientToRow(dto)` в [api.js](api.js).

> ⚠️ `latestCvRisk/DmRisk/BioAge` равны `null`, пока у пациента нет ни одной оценки
> (`POST /v1/patients/:id/assessments`). Проверить, прогоняет ли сид оценки; если нет —
> рисовать графики с заглушкой «нет данных».

---

## Риск №1 — CORS и порты (ПРОВЕРЕНО по коду)

Из [backend/src/plugins/security.ts](backend/src/plugins/security.ts) и [backend/src/config/env.ts](backend/src/config/env.ts):

- CORS включён: `credentials: true`, в `allowedHeaders` есть `Authorization` — **ок**.
- Разрешённые источники — `CORS_ORIGINS`, по умолчанию **`http://localhost:5173`** (порт Vite).
- Refresh-cookie: `SameSite=strict`, `secure` только в проде, `COOKIE_DOMAIN=localhost`.
  `localhost:5173` и `localhost:8080` — один site, поэтому strict-cookie **будет** ходить
  (порт на «site» не влияет), но только с `credentials: 'include'`.

**Блокер найден:** фронт и бэк по умолчанию оба слушают **:8080**
(`serve -l 8080` в [package.json](package.json) и `PORT` default 8080 в env). Их надо развести.

**Рекомендуемая дев-конфигурация:**
1. Бэкенд: `cd backend && npm run dev` → `http://localhost:8080`.
2. Фронт: раздавать на **:5173** — `npx serve -l 5173 .` (или поправить скрипт `start`).
3. `backend/.env`: `CORS_ORIGINS=http://localhost:5173` (уже значение по умолчанию).
4. Все запросы — с `Authorization`-заголовком; запросы, которым нужна refresh-cookie,
   идут с `credentials: 'include'` (в `api.js` это уже так).

---

## Фазы

### Фаза 0 — поднять бэкенд (блокер для проверки)
`cd backend` → `docker compose up -d postgres redis` → `npm i` → `npm run prisma:generate`
→ `npm run prisma:deploy` → `npm run db:seed` → `npm run dev`.
Сид-логин: `clinician@oab-clinic.demo` / `OabDemo_Clinician_2026!`. **~30–60 мин.**

### Фаза 1 — слой API на фронте ✅ ГОТОВО
Файл [api.js](api.js): обёртка над `fetch`, разворачивание конверта `{data, meta}`,
единая `ApiError`, автоповтор при `401` через refresh-cookie, методы `auth/patients/
analytics/predict` и адаптер `patientToRow`. Подключать `<script src="api.js"></script>`
ДО `dashboard.js`. **Сделано.**

### Фаза 2 — экран входа ✅ ГОТОВО
[login.html](login.html) + [login.js](login.js): форма email/пароль → `HCApi.auth.login()`
→ токен в памяти → `location.replace('dashboard.html')`. Особенности:
- тихий вход: на загрузке пробует `HCApi.auth.refresh()` (если refresh-cookie жива — сразу на дашборд);
- MFA: при ответе `MFA_REQUIRED` раскрывает поле 6-значного кода;
- ошибки разведены (401 / 429 / сеть / общий случай); защита от open-redirect в `?redirect=`.

Проверено в превью без бэкенда: страница рендерится (карточка 420px), `POST /v1/auth/login`
уходит, `preventDefault` работает, ошибки показываются, тихий refresh при 404 не роняет страницу.
Зелёный путь (успешный вход → редирект) требует живого бэкенда (Фаза 0).

**Осталось для Фазы 3:** гард на `dashboard.html` — на загрузке `await HCApi.auth.refresh()`;
если `false` → `location.replace('login.html?redirect=dashboard.html')`. Кнопка «выйти» → `HCApi.auth.logout()`.

### Фаза 3 — дашборд на реальных данных ✅ ГОТОВО
[dashboard.html](dashboard.html) подключает `api.js` до `dashboard.js`; в топбаре — индикатор
режима (`#authChip`) и кнопка «Войти/Выйти» (`#authBtn`). В [dashboard.js](dashboard.js):
- `PATIENTS` стал изменяемым (`let`), демо-набор вынесен в `DEMO_PATIENTS` как fallback;
- `loadRealPatients()` тянет `HCApi.patients.list({pageSize:100})` → `adapters.patientToRow` → ре-рендер таблиц;
- `patientRow` сделан устойчивым к `null` в `cv/dm/bio` (прочерки вместо падения);
- `refreshData` обновляет из API, если авторизован, иначе демо-тост; добавлен `window.logout`.

**Проектное решение — прогрессивное улучшение вместо жёсткого редиректа.** Дашборд
не выкидывает на логин при отсутствии бэка (иначе ломается офлайн-демо, ключевая ценность
проекта). Вместо этого `ensureSession()` различает три состояния:
`authenticated` (живые данные) · `demo` (сервер ответил, но сессии нет) · `offline` (сеть недоступна).
В `demo`/`offline` показываются демо-данные + бейдж режима и кнопка «Войти».

Проверено в превью: демо-режим показывает бейдж «● Демо-режим» и 5+10 строк; при
подменённом авторизованном API строки с `null`-рисками рендерятся как прочерки без ошибок,
маппинг `CRITICAL→Критический`, `FEMALE→Жен` корректен; консоль чистая.

**Аналитика KPI ✅ ГОТОВО.** В [dashboard.js](dashboard.js) добавлен `loadAnalytics()`
(вызывается при авторизации): `/v1/analytics/summary` → KPI-карточки (всего пациентов,
критический риск, AUC), `/v1/analytics/risk-distribution` → пончик + легенда распределения.
В [dashboard.html](dashboard.html) проставлены id (`kpiTotal/kpiCritical/kpiAuc`,
`rdLow/rdMed/rdHigh/rdCrit`). Проверено мок-данными: `1 543`, `0.861`, `1 100 (71%)` и т.д.
Остаётся опциональным: графики bio-age/heatmap (`/bio-age`, `/heatmap`).

### Фаза 4 — серверный прогноз ✅ ГОТОВО
В [predict.html](predict.html) добавлен переключатель «Источник вычислений: Браузер / Сервер API»
(подключены `api.js` и meta `hc-api-base`). В [predict.js](predict.js):
- по умолчанию — браузерный режим (мгновенный, офлайн), как раньше;
- серверный режим требует сессии: при выборе делается `auth.refresh()`, без сессии —
  ссылка «войти», переключения не происходит;
- серверный расчёт идёт через `HCApi.predict.run(profile)` с **дебаунсом 350 мс** (слайдеры
  «строчат» событиями) и защитой от гонок (учитывается только самый свежий ответ);
- при ошибке/недоступности API — автоматический откат на локальный движок с пометкой в подписи.

Формы ответа клиента и сервера идентичны — оба зовут один `runOmniRisk`, сервер отдаёт
`OmniRiskResult` прямо в конверте (проверено по `prediction.service.ts`). Контрфактическое
«что если» (`simulateIntervention`) оставлено на клиенте — мгновенно и та же математика.

Проверено в превью: браузерный режим рендерит 6 KPI + 28 болезней; переключение без бэка
даёт ссылку «войти» и остаётся на браузере; с мок-сессией считает «через сервер», а серия
из 5 быстрых движений слайдера схлопывается в **1** сетевой вызов (дебаунс работает).

---

## Порядок и зависимости
```
Фаза 0 (бэкенд) ─┬─> Фаза 1 (✅ api.js) ─> Фаза 2 (логин) ─> Фаза 3 (дашборд)
                 └─> Фаза 4 (независима, после Фазы 1)
```
Критический путь до «дашборд показывает реальных пациентов»: 0 → 1 → 2 → 3,
≈ 1–1,5 рабочих дня после поднятия бэкенда.

## Открытые вопросы
1. Прогоняет ли `db:seed` оценки рисков (иначе `latest*` поля = `null`).
2. Где будет жить фронт в проде (тот же Nginx/Fastify или отдельный CDN) — влияет на
   `CORS_ORIGINS` и `COOKIE_DOMAIN`.
