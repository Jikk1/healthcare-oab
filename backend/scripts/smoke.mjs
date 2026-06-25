#!/usr/bin/env node
/**
 * Post-deploy smoke test — fast, dependency-free liveness check of a running
 * API. Exits 0 if every check passes, 1 otherwise (so CI/deploy gates can fail).
 *
 *   SMOKE_BASE_URL=http://localhost:8080 node scripts/smoke.mjs
 *
 * Optional auth probe (skipped if creds absent): logs in with the seed
 * clinician and reads patients + analytics to confirm the data path works.
 */
const BASE = (process.env.SMOKE_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
const EMAIL = process.env.SMOKE_EMAIL ?? 'clinician@oab-clinic.demo';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'OabDemo_Clinician_2026!';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 8000);

let failures = 0;

function pass(name, detail = '') {
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  failures += 1;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function fetchJson(path, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { _raw: text };
    }
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`Smoke test against ${BASE}`);

  // 1) Liveness
  try {
    const { res, body } = await fetchJson('/health/live');
    if (res.status === 200 && body?.status === 'ok') pass('GET /health/live', `v${body.version}`);
    else fail('GET /health/live', `status=${res.status} body=${JSON.stringify(body)}`);
  } catch (e) {
    fail('GET /health/live', String(e?.message ?? e));
  }

  // 2) Readiness (deps reachable)
  try {
    const { res, body } = await fetchJson('/health/ready');
    if (res.status === 200 && body?.status === 'ready') pass('GET /health/ready', JSON.stringify(body.checks));
    else fail('GET /health/ready', `status=${res.status} body=${JSON.stringify(body)}`);
  } catch (e) {
    fail('GET /health/ready', String(e?.message ?? e));
  }

  // 3) Auth + data path (optional — needs a seeded DB)
  let token = null;
  try {
    const { res, body } = await fetchJson('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    token = body?.data?.accessToken ?? null;
    if (res.status === 200 && token) pass('POST /v1/auth/login', `role=${body.data.role}`);
    else fail('POST /v1/auth/login', `status=${res.status} code=${body?.error?.code ?? '-'}`);
  } catch (e) {
    fail('POST /v1/auth/login', String(e?.message ?? e));
  }

  if (token) {
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    try {
      const { res, body } = await fetchJson('/v1/patients?pageSize=1', auth);
      const total = body?.data?.total;
      if (res.status === 200 && Array.isArray(body?.data?.items)) pass('GET /v1/patients', `total=${total}`);
      else fail('GET /v1/patients', `status=${res.status}`);
    } catch (e) {
      fail('GET /v1/patients', String(e?.message ?? e));
    }
    try {
      const { res, body } = await fetchJson('/v1/analytics/summary', auth);
      if (res.status === 200 && typeof body?.data?.totalPatients === 'number')
        pass('GET /v1/analytics/summary', `patients=${body.data.totalPatients}`);
      else fail('GET /v1/analytics/summary', `status=${res.status}`);
    } catch (e) {
      fail('GET /v1/analytics/summary', String(e?.message ?? e));
    }
  }

  console.log('');
  if (failures > 0) {
    console.error(`Smoke test FAILED (${failures} check(s)).`);
    process.exit(1);
  }
  console.log('Smoke test PASSED.');
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
