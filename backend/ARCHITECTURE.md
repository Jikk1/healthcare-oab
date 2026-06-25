# HealthCareOAB+ Backend — Architecture

## 1. Context & goals

HealthCareOAB+ is a multi-tenant SaaS that lets clinics manage patient cohorts
and compute **explainable** cardiometabolic risk (MI, stroke, T2D, CKD, onco,
neuro), biological age, intervention recommendations, scenario simulations and
population analytics. The backend exists to serve the existing frontend with a
secure, auditable, horizontally-scalable API over protected health information
(PHI).

Primary non-functional drivers, in priority order:

1. **PHI safety & compliance** — encryption at rest, tenant isolation, a
   tamper-evident audit trail of every PHI access.
2. **Correctness & reproducibility** — a deterministic, versioned risk engine
   whose stored outputs can always be re-derived and audited.
3. **Operability** — health probes, RED metrics, structured logs, tracing.
4. **Evolvability** — bounded contexts that can be peeled into services later.

## 2. Architectural style: modular monolith

A **modular monolith** is the right stage-appropriate choice: a single
deployable with strict internal module boundaries (`src/modules/<context>`).
Each module owns its schema slice, service and routes; cross-module calls go
through service interfaces, not each other's tables. This yields microservice-
grade separation of concerns without the operational tax (network hops,
distributed transactions, multi-repo sprawl) that a 1-team product can't yet
justify. When a context (e.g. the risk engine, or billing) needs independent
scaling or release cadence, it can be extracted with its boundary already drawn.

```
src/
  config/        env validation (fail-fast, 12-factor)
  shared/        crypto, jwt, prisma, redis, logger, metrics, tracing, http, errors
  plugins/       fastify: request-context, security, auth, rate-limit, error-handler
  modules/
    auth/        register/login/refresh/logout, MFA, password reset, tokens
    users/       profile, members, roles, sessions
    organizations/ tenant settings
    patients/    PHI-bearing patient CRUD (tenant-scoped repository)
    risk/        domain/ (pure engine + recommendations) + risk.service
    analytics/   population read models
    billing/     plans, limits, subscription
    audit/       hash-chained audit log
    health/      probes + metrics
  workers/       outbox dispatcher
  app.ts         composition root (no port binding → testable)
  main.ts        bootstrap, graceful shutdown
```

## 3. Request lifecycle

`onRequest`: correlation id (honours inbound `X-Request-Id`) → security headers
(helmet/CORS) → rate limit (Redis token bucket, keyed by user or IP). Route
`preHandler`: `authenticate` (verify JWT, check global denylist) → `requireRole`
(RBAC). Handler: Zod-parse input → service. `onResponse`: RED metrics. Any throw
funnels through a single error handler that maps `AppError`/`ZodError`/Prisma
errors to a stable wire envelope. 5xx internals are logged, never leaked.

## 4. Security model

- **AuthN**: short-lived JWT access tokens (HS256, ~15 min) + opaque rotating
  refresh tokens. Refresh tokens are stored only as SHA-256 hashes in `Session`
  rows; rotation uses a **family** lineage so that presenting an already-rotated
  token is treated as theft and revokes the whole family. A Redis denylist
  enables global force-logout despite stateless access tokens.
- **AuthZ**: RBAC via the `Role` enum on `Membership`; tenant isolation (ABAC) is
  enforced in the repository layer — every PHI query is scoped by
  `organizationId`, so no query can cross a tenant boundary.
- **PHI at rest**: names and birth date are AES-256-GCM ciphertext
  (`shared/crypto.ts`), authenticated so tampering fails closed. Non-identifying
  attributes (sex, age, risk cache) stay plaintext for analytics/filtering.
  Name search needs a blind-index/HMAC column in prod (MRN is searchable today).
- **Passwords**: argon2id (memory-hard, tuned via env). Brute-force lockout
  after 5 failures for 15 minutes; uniform failure responses to avoid user
  enumeration and timing leaks.
- **MFA**: TOTP (otplib) with encrypted secrets and hashed single-use recovery
  codes.
- **Transport/browser**: HSTS, strict CSP (`default-src 'none'` — JSON API),
  frame-deny, CORS allowlist, HttpOnly/SameSite=strict signed refresh cookie.
- **Secrets**: validated at boot; in prod sourced from KMS/Vault, not env.

## 5. The risk engine (domain core)

`modules/risk/domain/risk-engine.ts` is a **pure, deterministic, additive-points
model** in the spirit of Framingham/SCORE2/QRISK. Design properties (all unit-
tested):

- **Pure & deterministic** — no I/O, no clock; same input → same output.
- **Explainable** — every input yields a signed SHAP-like attribution, returned
  sorted by influence, so clinicians see *why* a score moved.
- **Monotonic** in each adverse factor; **bounded** (each domain risk clamped).
- **Versioned** (`MODEL_VERSION`) — stored assessments remain reproducible and
  auditable; a coefficient change bumps the version.

It also produces biological age, confidence intervals, and a 10-year MI
trajectory for the scenario simulator. Recommendations are a separate pure
rule-set mapping modifiable factors to guideline-referenced interventions
(ESC/USPSTF/WHO/AHA/ADA/KDIGO). Keeping these pure makes them trivially testable
and keeps clinical logic out of the persistence layer.

## 6. Data & consistency

PostgreSQL via Prisma. Notable patterns:

- **Denormalized risk cache** on `Patient` (`latestRiskLevel/cvRisk/dmRisk/bioAge`)
  for fast list/overview reads, refreshed atomically when an assessment is saved.
- **Transactional outbox** (`OutboxEvent`): domain events are written in the same
  DB transaction as the state change, then relayed by `workers/outbox-dispatcher`
  — at-least-once delivery with no dual-write inconsistency. Swap the `publish`
  sink for Kafka/SNS/webhooks in prod.
- **Idempotency keys** back safe retries on mutating endpoints.
- **Tamper-evident audit log**: each entry hashes `prevHash + canonical(payload)`,
  forming a chain; `GET /v1/audit/verify` recomputes it and reports the first
  broken entry. Mandatory for "who accessed which PHI, when".

## 7. Observability

- **Logs**: pino structured JSON with defensive PHI/secret redaction; pretty in
  dev, raw JSON in prod for Loki/ELK.
- **Metrics**: prom-client RED metrics per route + domain counters
  (risk computations, auth events) at `/metrics`.
- **Tracing**: OpenTelemetry auto-instrumentation (OTLP → Jaeger), enabled via
  `OTEL_ENABLED`; initialised before any instrumented import in `main.ts`.
- **Health**: `/health/live` (liveness) and `/health/ready` (checks DB + Redis).

## 8. Deployment & scaling

Multi-stage Docker image runs as non-root with a read-only root filesystem. The
app is stateless (all session/rate-limit/denylist state lives in Redis), so it
scales horizontally behind the Kubernetes `Deployment` + `HPA` in `infra/k8s`.
DB migrations run as a pre-deploy `Job` (`prisma migrate deploy`). `infra/terraform`
provisions encrypted, multi-AZ RDS PostgreSQL + ElastiCache Redis + ECR. CI
(`.github/workflows/ci.yml`) gates on lint, typecheck, unit tests, a live
Postgres/Redis integration run, and an image build.

## 9. Testing strategy

- **Unit (infra-free, default `npm test`)**: the risk/recommendation engines
  (determinism, monotonicity, bounds, thresholds, explainability) and crypto
  (encrypt/decrypt round-trip, GCM tamper rejection, argon2 verify, constant-time
  compare). These cover the highest-risk logic with no DB/Redis.
- **Integration (`RUN_INTEGRATION=1`)**: full HTTP happy path via `app.inject`
  against real Postgres + Redis — register → authenticate → create patient →
  score → verify audit chain. No mocks, so it catches migration/prod drift.

## 10. Key trade-offs

| Decision | Why | Cost / future |
|---|---|---|
| Modular monolith | Right stage; strict boundaries, low ops tax | Extract contexts to services when scaling demands |
| Deterministic additive risk model | Explainable, auditable, testable | Less raw accuracy than ML; recalibrate on real cohorts |
| Encrypt names, plaintext demographics | Filter/aggregate without decrypt | Name search needs a blind index in prod |
| `tsx` runtime (dev + prod) | No `.js`-extension ESM friction | Slightly heavier than precompiled `dist/` |
| Stateless app + Redis | Horizontal scale, global logout | Redis is a hard dependency on the request path |
