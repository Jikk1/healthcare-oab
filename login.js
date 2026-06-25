/* ============================================================
   HealthCareOAB+ — Login page logic (Phase 2)
   ============================================================
   Зависит от api.js (window.HCApi), подключённого выше.
   Поток:
     1. На загрузке пробуем тихий refresh (вдруг refresh-cookie ещё жива) —
        тогда сразу уводим на дашборд, минуя форму.
     2. submit → HCApi.auth.login(email, password[, mfaCode]).
     3. MFA_REQUIRED → раскрываем поле кода и просим ввести его.
     4. Успех → access-токен в памяти + redirect.
   ============================================================ */
(() => {
  'use strict';

  if (!window.HCApi) {
    // api.js не загрузился — без него страница бессмысленна.
    document.getElementById('authError')?.removeAttribute('hidden');
    return;
  }

  const form = document.getElementById('loginForm');
  const emailEl = document.getElementById('email');
  const passwordEl = document.getElementById('password');
  const mfaField = document.getElementById('mfaField');
  const mfaEl = document.getElementById('mfaCode');
  const errEl = document.getElementById('authError');
  const btn = document.getElementById('submitBtn');

  /* ---------- Куда уходить после входа ---------- */
  // Только относительный путь в пределах сайта — защита от open-redirect.
  function safeRedirect(raw) {
    if (!raw) return 'dashboard.html';
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('/')) {
      return 'dashboard.html';
    }
    return raw;
  }
  const target = safeRedirect(new URLSearchParams(location.search).get('redirect'));

  /* ---------- UI-помощники ---------- */
  function showError(msg) {
    errEl.textContent = msg;
    errEl.removeAttribute('hidden');
  }
  function hideError() {
    errEl.setAttribute('hidden', '');
  }
  function setLoading(on) {
    btn.disabled = on;
    btn.textContent = on ? 'Входим…' : 'Войти';
  }
  let mfaShown = false;
  function revealMfa() {
    mfaField.classList.remove('is-hidden');
    mfaShown = true;
    mfaEl.focus();
  }

  /* ---------- Тихий вход по существующей сессии ---------- */
  HCApi.auth
    .refresh()
    .then((ok) => {
      if (ok) location.replace(target);
    })
    .catch(() => {
      /* нет валидной сессии — показываем форму как есть */
    });

  /* ---------- Сабмит ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const mfaCode = mfaShown ? mfaEl.value.trim() : undefined;

    if (!email || !password) {
      showError('Введите email и пароль.');
      return;
    }
    if (mfaShown && !/^\d{6}$/.test(mfaCode || '')) {
      showError('Код MFA — это 6 цифр.');
      return;
    }

    setLoading(true);
    try {
      await HCApi.auth.login(email, password, mfaCode);
      location.replace(target);
    } catch (err) {
      const code = err && err.code;
      const status = err && err.status;
      if (code === 'MFA_REQUIRED') {
        if (!mfaShown) {
          revealMfa();
          showError('Аккаунт защищён MFA — введите код из приложения.');
        } else {
          showError('Неверный код MFA. Попробуйте ещё раз.');
        }
      } else if (code === 'NETWORK') {
        showError('Сервер не отвечает. Запущен ли бэкенд на ' + HCApi.baseUrl + '?');
      } else if (status === 401) {
        showError('Неверный email или пароль.');
      } else if (status === 429) {
        showError('Слишком много попыток. Подождите минуту и повторите.');
      } else {
        showError((err && err.message) || 'Не удалось войти. Попробуйте позже.');
      }
      setLoading(false);
    }
  });
})();
