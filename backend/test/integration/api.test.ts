/**
 * End-to-end happy-path against a live Postgres + Redis. Skipped by default so
 * `npm test` stays infra-free; enable with RUN_INTEGRATION=1 (CI runs it after
 * `prisma migrate deploy`). Exercises the real HTTP stack via app.inject — no
 * mocks, so it would have caught the prod migration class of bugs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const run = process.env.RUN_INTEGRATION ? describe : describe.skip;

run('API integration (happy path)', () => {
  let app: FastifyInstance;
  let accessToken: string;
  const email = `it-${Date.now()}@example.test`;
  const password = 'Integration-Test-Pass-2026';

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { connectRedis } = await import('../../src/shared/redis.js');
    await connectRedis();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    const { prisma } = await import('../../src/shared/prisma.js');
    await prisma.$disconnect();
  });

  it('liveness probe responds', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('registers a new organization + owner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password, fullName: 'Integration Owner', organizationName: 'IT Clinic' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.role).toBe('OWNER');
    expect(body.accessToken).toBeTruthy();
    accessToken = body.accessToken;
  });

  it('rejects unauthenticated access', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/patients' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('returns the current user profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.email).toBe(email);
  });

  it('creates a patient and scores an assessment', async () => {
    const auth = { authorization: `Bearer ${accessToken}` };
    const created = await app.inject({
      method: 'POST',
      url: '/v1/patients',
      headers: auth,
      payload: { firstName: 'Иван', lastName: 'Тестов', sex: 'MALE', ageYears: 57 },
    });
    expect(created.statusCode).toBe(201);
    const patientId = created.json().data.id;

    const assessed = await app.inject({
      method: 'POST',
      url: `/v1/patients/${patientId}/assessments`,
      headers: auth,
      payload: {
        systolicBp: 160,
        ldl: 4.6,
        hdl: 1.0,
        hba1c: 6.9,
        bmi: 30,
        egfr: 70,
        smokingStatus: 'CURRENT',
        packYears: 25,
        activityPerWeek: 1,
        familyHistoryCvd: true,
        onStatins: false,
      },
    });
    expect(assessed.statusCode).toBe(201);
    const data = assessed.json().data;
    expect(['HIGH', 'CRITICAL']).toContain(data.assessment.riskLevel);
    expect(data.recommendations.length).toBeGreaterThan(0);
  });

  it('exposes a verifiable audit chain', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/audit/verify',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);
  });
});
