/* ============================================================
   HealthCareOAB+ — Передача профиля между страницами (handoff)
   ============================================================
   labs.html собирает богатый HealthProfile (ОАК, биохимия, витальные…),
   а predict.html умеет его детально разобрать (SHAP, «что если»). Раньше
   кнопка «Детальный разбор →» просто вела на predict.html и теряла ввод.
   Этот модуль кладёт профиль в sessionStorage на исходной странице и
   одноразово забирает его на целевой — так данные переезжают без бэкенда
   и без URL-параметров (профиль может быть большим и содержать ПДн).
   ============================================================ */

const KEY = 'hc:handoff:profile';

/** Сохранить профиль и уйти на целевую страницу. Профиль живёт только в
 *  рамках вкладки (sessionStorage), забирается один раз. */
export function stashProfile(profile, targetUrl) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ v: 1, profile, ts: Date.now() }));
  } catch {
    /* приватный режим / нет квоты — молча продолжаем, целевая страница
       просто откроется в песочнице по умолчанию */
  }
  if (targetUrl) window.location.assign(targetUrl);
}

/** Одноразово забрать переданный профиль (или null, если его нет). */
export function takeProfile() {
  let raw;
  try {
    raw = sessionStorage.getItem(KEY);
    if (raw) sessionStorage.removeItem(KEY); // one-shot: обновление страницы не «залипает»
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.profile ? parsed.profile : null;
  } catch {
    return null;
  }
}
