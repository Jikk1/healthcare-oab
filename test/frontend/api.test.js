import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Загружаем клиент один раз: IIFE навешивает window.HCApi (jsdom предоставляет window/document).
let api;
beforeAll(async () => {
  await import('../../api.js');
  api = window.HCApi;
});

// Мини-ответ fetch: парсер api.js читает res.text(); 204 не читается.
const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (body == null ? '' : JSON.stringify(body)),
});

beforeEach(() => {
  api.setAccessToken(null);
  globalThis.fetch = vi.fn();
});

describe('HCApi — конверт и запросы', () => {
  it('разворачивает { data } из успешного конверта', async () => {
    fetch.mockResolvedValueOnce(res(200, { data: { x: 1 }, meta: { requestId: 'r1' } }));
    const out = await api.request('/v1/thing');
    expect(out).toEqual({ x: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:8080/v1/thing');
  });

  it('строит query-параметры и пропускает пустые', async () => {
    fetch.mockResolvedValueOnce(res(200, { data: { items: [] } }));
    await api.patients.list({ page: 2, level: 'HIGH', search: 'ив', archived: '' });
    const url = fetch.mock.calls[0][0];
    expect(url).toContain('/v1/patients?');
    expect(url).toContain('page=2');
    expect(url).toContain('level=HIGH');
    expect(url).toContain(encodeURIComponent('ив'));
    expect(url).not.toContain('archived=');
  });

  it('прикладывает Bearer-токен, когда он установлен', async () => {
    api.setAccessToken('tok-1');
    fetch.mockResolvedValueOnce(res(200, { data: {} }));
    await api.request('/v1/me');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-1');
  });

  it('на 401 обновляет токен через refresh и повторяет запрос', async () => {
    api.setAccessToken('old');
    fetch
      .mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } })) // исходный
      .mockResolvedValueOnce(res(200, { data: { accessToken: 'new' } })) // refresh
      .mockResolvedValueOnce(res(200, { data: { ok: true } })); // повтор
    const out = await api.request('/v1/secure');
    expect(out).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1][0]).toContain('/v1/auth/refresh');
    expect(api.getAccessToken()).toBe('new');
    // Повторный запрос ушёл уже с новым токеном.
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer new');
  });

  it('если refresh не удался — пробрасывает исходную ошибку и не зацикливается', async () => {
    api.setAccessToken('old');
    fetch
      .mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(res(401, { error: { code: 'UNAUTHORIZED', message: 'no cookie' } })); // refresh тоже 401
    await expect(api.request('/v1/secure')).rejects.toMatchObject({ status: 401 });
    // 1 исходный + 1 refresh (refresh не ретраится повторно).
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('маппит конверт ошибки в ApiError (code/status/details)', async () => {
    fetch.mockResolvedValueOnce(res(400, { error: { code: 'VALIDATION', message: 'плохое поле', details: { field: 'age' } } }));
    await expect(api.request('/v1/x', { auth: false })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION',
      message: 'плохое поле',
    });
  });

  it('сетевой сбой → ApiError code NETWORK', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.request('/v1/x', { auth: false })).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });

  it('204 No Content возвращает null (archive)', async () => {
    api.setAccessToken('t');
    fetch.mockResolvedValueOnce(res(204, null));
    const out = await api.patients.archive('id-1');
    expect(out).toBeNull();
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(fetch.mock.calls[0][0]).toContain('/v1/patients/id-1');
  });
});

describe('HCApi — методы ресурсов бьют по правильным путям', () => {
  it('patients.create → POST /v1/patients с телом', async () => {
    api.setAccessToken('t');
    fetch.mockResolvedValueOnce(res(201, { data: { id: 'new' } }));
    await api.patients.create({ firstName: 'А', lastName: 'Б', sex: 'MALE', ageYears: 40 });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:8080/v1/patients');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ lastName: 'Б', ageYears: 40 });
  });

  it('patients.update → PATCH; assess → POST /assessments', async () => {
    api.setAccessToken('t');
    fetch.mockResolvedValueOnce(res(200, { data: {} }));
    await api.patients.update('p1', { ageYears: 41 });
    expect(fetch.mock.calls[0][1].method).toBe('PATCH');
    expect(fetch.mock.calls[0][0]).toContain('/v1/patients/p1');

    fetch.mockResolvedValueOnce(res(201, { data: { assessment: {} } }));
    await api.patients.assess('p1', { ldl: 4 });
    expect(fetch.mock.calls[1][0]).toContain('/v1/patients/p1/assessments');
    expect(fetch.mock.calls[1][1].method).toBe('POST');
  });

  it('billing и audit вызывают свои эндпоинты', async () => {
    api.setAccessToken('t');
    fetch.mockResolvedValue(res(200, { data: {} }));
    await api.billing.subscription();
    await api.billing.changePlan('PRO');
    await api.audit.logs({ pageSize: 50 });
    await api.audit.verify();
    const urls = fetch.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.endsWith('/v1/billing/subscription'))).toBe(true);
    expect(urls.some((u) => u.includes('/v1/audit/logs?pageSize=50'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/v1/audit/verify'))).toBe(true);
  });
});

describe('HCApi.adapters.patientToRow', () => {
  it('преобразует PatientDto в строку таблицы с _id и кодами', () => {
    const row = api.adapters.patientToRow({
      id: 'uuid-1', mrn: 'P-7', firstName: 'Иван', lastName: 'Петров', fullName: 'Петров Иван',
      initials: 'ПИ', sex: 'MALE', ageYears: 50, latestRiskLevel: 'HIGH', latestCvRisk: 21.3, latestDmRisk: null, latestBioAge: 55,
    });
    expect(row).toMatchObject({
      id: 'P-7', _id: 'uuid-1', firstName: 'Иван', lastName: 'Петров',
      sexCode: 'MALE', age: 50, cv: 21.3, dm: null, bio: 55, level: 'high',
    });
  });
});
