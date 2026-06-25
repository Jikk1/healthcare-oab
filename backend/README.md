
# HealthCareOAB+ — Backend

Production-grade backend for the HealthCareOAB+ clinical risk-prediction SaaS.
TypeScript · Fastify · Prisma (PostgreSQL) · Redis. Powers the existing
HealthCareOAB+ frontend (patient cohorts, explainable risk scoring, scenario
simulation, population analytics).

> Clinical disclaimer: the risk engine is decision **support**, not a diagnostic
> device. Coefficients are illustrative and must be recalibrated on real cohort
> data before any clinical deployment.

---

## Quick start (Docker)

```bash
cd backend
docker compose up -d                 # postgres, redis, api, prometheus, grafana, jaeger
docker compose exec api npm run prisma:deploy
docker compose exec api npm run db:seed
# API:        http://localhost:8080
# Metrics:    http://localhost:8080/metrics
# Grafana:    http://localhost:3000   (anonymous)
# Jaeger:     http://localhost:16686
```

## Quick start (local Node)

Requires Node ≥ 20.11, plus a reachable PostgreSQL and Redis.

```bash
cd backend
cp .env.example .env                 # then edit secrets
npm install
npx prisma generate
npx prisma migrate deploy            # or: npm run prisma:migrate (dev)
npm run db:seed
npm run dev                          # tsx watch, hot reload
```

Seed credentials (override via `SEED_*` env):

| Role      | Email                       | Password                 |
|-----------|-----------------------------|--------------------------|
| Owner     | `owner@oab-clinic.demo`     | `OabDemo_Owner_2026!`    |
| Clinician | `clinician@oab-clinic.demo` | `OabDemo_Clinician_2026!`|

---

## Scripts

| Script                 | Purpose                                  |
|------------------------|------------------------------------------|
| `npm run dev`          | Hot-reloading dev server (`tsx watch`)   |
| `npm start`            | Run via `tsx/esm` (used in the container)|
| `npm run build`        | Type-check & emit to `dist/`             |
| `npm run typecheck`    | `tsc --noEmit`                           |
| `npm run lint`         | ESLint                                   |
| `npm test`             | Vitest (unit; infra-free)                |
| `RUN_INTEGRATION=1 npm test` | + live Postgres/Redis e2e suite    |
| `npm run db:seed`      | Seed the demo tenant + 10 patients       |
| `npm run db:reset`     | Reset DB and reseed                      |

---

## API surface (all JSON, prefix `/v1`)

Uniform envelope: `{ "data": ..., "meta": { "requestId": ... } }`.
Errors: `{ "error": { "code", "message", "details?" }, "meta": { "requestId" } }`.

**Auth** — `POST /auth/register · /auth/login · /auth/refresh · /auth/logout`,
`POST /auth/password/reset-request · /auth/password/reset-confirm`,
`POST /auth/mfa/setup · /auth/mfa/confirm`, `DELETE /auth/mfa`.

**Users** — `GET/PATCH /users/me`, `GET/DELETE /users/me/sessions[/:id]`,
`GET /users`, `POST /users/invite`, `PATCH /users/:userId/role`, `DELETE /users/:userId`.

**Organizations** — `GET/PATCH /organizations/current`.

**Patients & clinical** — `GET/POST /patients`, `GET/PATCH/DELETE /patients/:id`,
`POST /patients/:id/assessments`, `GET /patients/:id/assessments/latest`,
`POST /patients/:id/scenario`, `GET /patients/:id/recommendations`.

**Analytics** — `GET /analytics/summary · /risk-distribution · /bio-age · /heatmap`.

**Billing** — `GET /billing/plans · /billing/subscription · /billing/invoices`,
`POST /billing/subscription`.

**Audit** — `GET /audit/logs · /audit/verify`.

**Ops** (unauthenticated) — `GET /health/live · /health/ready · /metrics`.

---

## Configuration

All config is validated at boot by `src/config/env.ts` (fail-fast). See
[`.env.example`](.env.example) for the full list. Required:
`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`PHI_ENCRYPTION_KEY`. In production, secrets come from a KMS/Vault — never env.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full design rationale.
