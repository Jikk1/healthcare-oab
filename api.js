/* ============================================================
   HealthCareOAB+ — Frontend API client (Phase 1)
   ============================================================
   Тонкая обёртка над fetch для бэкенда /v1. Без сборки и зависимостей —
   обычный глобальный скрипт, как charts.js. Подключать ДО dashboard.js:

       <script src="api.js"></script>

   Контракт (подтверждён по коду backend/):
     - Успех:  { "data": ..., "meta": { "requestId" } }
     - Ошибка: { "error": { "code", "message", "details? }, "meta": {...} }
     - Логин кладёт refresh-токен в httpOnly-cookie (path /v1/auth);
       access-токен живёт только в памяти этой вкладки.
   ============================================================ */
(() => {
  'use strict';

  /* ---------- Конфигурация ---------- */
  // База API. Переопределяется через <meta name="hc-api-base" content="..."> или HCApi.configure().
  // Дев-замечание: фронт и бэк по умолчанию оба хотят :8080 — разведите порты
  // (фронт на :5173, бэк на :8080), иначе CORS/конфликт порта. См. INTEGRATION_PLAN.md.
  function readMetaBase() {
    const el = document.querySelector('meta[name="hc-api-base"]');
    return el && el.content ? el.content.replace(/\/+$/, '') : null;
  }

  const state = {
    baseUrl: readMetaBase() || 'http://localhost:8080',
    accessToken: null, // только в памяти — не в localStorage (XSS)
  };

  /* ---------- Ошибки ---------- */
  class ApiError extends Error {
    constructor(message, { status, code, details, requestId } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
      this.requestId = requestId;
    }
  }

  /* ---------- Низкоуровневый запрос ---------- */
  function buildUrl(path, query) {
    const url = new URL(path.replace(/^\//, ''), state.baseUrl + '/');
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  async function parseBody(res) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { _raw: text };
    }
  }

  /**
   * Единая точка запросов. Разворачивает конверт, кидает ApiError, и при 401
   * один раз пытается обновить access-токен через refresh-cookie и повторить.
   *
   * @param {string} path  путь от корня, напр. '/v1/patients'
   * @param {object} opts  { method, body, query, auth=true, credentials, _retried }
   * @returns {Promise<any>} содержимое поля data
   */
  async function request(path, opts = {}) {
    const { method = 'GET', body, query, auth = true, _retried = false } = opts;
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && state.accessToken) headers['Authorization'] = `Bearer ${state.accessToken}`;

    let res;
    try {
      res = await fetch(buildUrl(path, query), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        // credentials нужны, чтобы refresh-cookie ходила (cross-origin dev).
        credentials: opts.credentials || 'include',
      });
    } catch (networkErr) {
      throw new ApiError('Сеть недоступна или сервер не отвечает', {
        status: 0,
        code: 'NETWORK',
        details: String(networkErr && networkErr.message),
      });
    }

    // 204 No Content (logout, delete) — тела нет.
    if (res.status === 204) return null;

    const payload = await parseBody(res);
    const requestId = payload && payload.meta && payload.meta.requestId;

    if (res.ok) {
      return payload ? payload.data : null;
    }

    // Протух access-токен → один раз обновляемся по cookie и повторяем.
    if (res.status === 401 && auth && !_retried && path !== '/v1/auth/refresh') {
      const refreshed = await tryRefresh();
      if (refreshed) return request(path, { ...opts, _retried: true });
    }

    const err = (payload && payload.error) || {};
    throw new ApiError(err.message || `Запрос завершился ошибкой (${res.status})`, {
      status: res.status,
      code: err.code,
      details: err.details,
      requestId,
    });
  }

  /* ---------- Управление токеном ---------- */
  function setAccessToken(token) {
    state.accessToken = token || null;
  }
  function getAccessToken() {
    return state.accessToken;
  }
  function isAuthenticated() {
    return Boolean(state.accessToken);
  }

  // Тихое обновление: refresh-токен берётся из httpOnly-cookie сервером.
  async function tryRefresh() {
    try {
      const data = await request('/v1/auth/refresh', {
        method: 'POST',
        body: {},
        auth: false,
        _retried: true, // не зацикливаться
      });
      if (data && data.accessToken) {
        setAccessToken(data.accessToken);
        return true;
      }
    } catch {
      /* refresh не удался — пользователю нужно войти заново */
    }
    return false;
  }

  /* ---------- Auth ---------- */
  const auth = {
    // mfaCode передаётся, только если у аккаунта включён MFA (сервер ответит
    // ошибкой code:'MFA_REQUIRED' на первый запрос без кода).
    async login(email, password, mfaCode) {
      const body = { email, password };
      if (mfaCode) body.mfaCode = mfaCode;
      const data = await request('/v1/auth/login', {
        method: 'POST',
        body,
        auth: false,
      });
      setAccessToken(data.accessToken);
      return data; // { user, organization, role, accessToken, ... }
    },
    refresh: tryRefresh,
    async logout() {
      try {
        await request('/v1/auth/logout', { method: 'POST', body: {}, auth: false });
      } finally {
        setAccessToken(null);
      }
    },
  };

  /* ---------- Пациенты и клиника ---------- */
  const patients = {
    // params: { page, pageSize, level, archived, search }
    list(params = {}) {
      return request('/v1/patients', { query: params }); // → { items, page, pageSize, total, totalPages }
    },
    get(id) {
      return request(`/v1/patients/${encodeURIComponent(id)}`);
    },
    latestAssessment(id) {
      return request(`/v1/patients/${encodeURIComponent(id)}/assessments/latest`);
    },
    assess(id, biomarkers) {
      return request(`/v1/patients/${encodeURIComponent(id)}/assessments`, {
        method: 'POST',
        body: biomarkers,
      });
    },
    scenario(id, overrides = {}) {
      return request(`/v1/patients/${encodeURIComponent(id)}/scenario`, {
        method: 'POST',
        body: overrides,
      });
    },
    recommendations(id) {
      return request(`/v1/patients/${encodeURIComponent(id)}/recommendations`);
    },
  };

  /* ---------- Аналитика ---------- */
  const analytics = {
    summary: () => request('/v1/analytics/summary'),
    riskDistribution: () => request('/v1/analytics/risk-distribution'),
    bioAge: () => request('/v1/analytics/bio-age'),
    heatmap: () => request('/v1/analytics/heatmap'),
  };

  /* ---------- OmniRisk (Фаза 4) ---------- */
  const predict = {
    model: () => request('/v1/predict/model'),
    catalog: () => request('/v1/predict/catalog'),
    run: (profile) => request('/v1/predict', { method: 'POST', body: profile }),
    intervention: (profile, overrides) =>
      request('/v1/predict/intervention', { method: 'POST', body: { profile, overrides } }),
    forPatient: (id) => request(`/v1/patients/${encodeURIComponent(id)}/predict`),
  };

  /* ---------- Адаптеры под текущий фронт ---------- */
  // Преобразует PatientDto сервера в форму строки PATIENTS из dashboard.js.
  const SEX_RU = { MALE: 'Муж', FEMALE: 'Жен', OTHER: '—' };
  function patientToRow(dto) {
    return {
      id: dto.mrn || dto.id,
      _id: dto.id, // настоящий UUID для последующих запросов
      name: dto.fullName,
      initials: dto.initials,
      sex: SEX_RU[dto.sex] || dto.sex,
      age: dto.ageYears,
      cv: dto.latestCvRisk == null ? null : dto.latestCvRisk,
      dm: dto.latestDmRisk == null ? null : dto.latestDmRisk,
      bio: dto.latestBioAge == null ? null : dto.latestBioAge,
      level: (dto.latestRiskLevel || 'low').toLowerCase(),
    };
  }

  /* ---------- Экспорт ---------- */
  window.HCApi = {
    configure({ baseUrl } = {}) {
      if (baseUrl) state.baseUrl = baseUrl.replace(/\/+$/, '');
    },
    get baseUrl() {
      return state.baseUrl;
    },
    request,
    setAccessToken,
    getAccessToken,
    isAuthenticated,
    auth,
    patients,
    analytics,
    predict,
    adapters: { patientToRow },
    ApiError,
  };
})();
