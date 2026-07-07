/* ============================================================
   HealthCareOAB+ — лёгкий runtime-i18n (RU по умолчанию, EN — перевод)
   ------------------------------------------------------------
   Русский — источник (лежит прямо в разметке). Переводимые узлы помечаются:
     data-i18n="ключ"            — переводит textContent
     data-i18n-attr="attr:ключ"  — переводит атрибут (можно несколько через ';')
   EN-словарь — в locales/en.js (ключ → строка). При переключении на 'ru'
   восстанавливаем исходный русский текст (снятый снимок при первом проходе).

   Выбор языка хранится в localStorage и проставляется в <html lang>.
   Подключение: import { initI18n } from './lib/i18n.js'; initI18n();
   ============================================================ */
import { EN } from '../locales/en.js';

const STORE_KEY = 'hc-lang';
const originals = new WeakMap(); // node -> { text, attrs:{name:value} }

function snapshot(el) {
  if (originals.has(el)) return originals.get(el);
  const snap = { text: null, html: null, attrs: {} };
  if (el.hasAttribute('data-i18n')) snap.text = el.textContent;
  if (el.hasAttribute('data-i18n-html')) snap.html = el.innerHTML;
  const attrSpec = el.getAttribute('data-i18n-attr');
  if (attrSpec) {
    for (const pair of attrSpec.split(';')) {
      const name = pair.split(':')[0].trim();
      if (name) snap.attrs[name] = el.getAttribute(name);
    }
  }
  originals.set(el, snap);
  return snap;
}

function applyLocale(lang) {
  const toEn = lang === 'en';
  document.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-attr]').forEach((el) => {
    const snap = snapshot(el);
    // текст
    if (el.hasAttribute('data-i18n')) {
      const key = el.getAttribute('data-i18n');
      el.textContent = toEn ? (EN[key] ?? snap.text) : snap.text;
    }
    // разметка (заголовки со <br>/<span>, пункты с маркерами) — значения доверенные (наш словарь)
    if (el.hasAttribute('data-i18n-html')) {
      const key = el.getAttribute('data-i18n-html');
      el.innerHTML = toEn ? (EN[key] ?? snap.html) : snap.html;
    }
    // атрибуты: "placeholder:key;aria-label:key2"
    const attrSpec = el.getAttribute('data-i18n-attr');
    if (attrSpec) {
      for (const pair of attrSpec.split(';')) {
        const [name, key] = pair.split(':').map((s) => s.trim());
        if (!name || !key) continue;
        el.setAttribute(name, toEn ? (EN[key] ?? snap.attrs[name]) : snap.attrs[name]);
      }
    }
  });
  document.documentElement.lang = lang;
}

export function setLocale(lang) {
  const l = lang === 'en' ? 'en' : 'ru';
  try { localStorage.setItem(STORE_KEY, l); } catch { /* приватный режим */ }
  applyLocale(l);
  // Обновляем все переключатели языка на странице.
  document.querySelectorAll('[data-lang-toggle]').forEach((btn) => {
    btn.textContent = l === 'en' ? 'RU' : 'EN';
    btn.setAttribute('aria-label', l === 'en' ? 'Переключить на русский' : 'Switch to English');
  });
}

export function getLocale() {
  try { return localStorage.getItem(STORE_KEY) === 'en' ? 'en' : 'ru'; } catch { return 'ru'; }
}

/** Инициализация: применяет сохранённый язык и вешает делегированный обработчик
 *  на кнопки [data-lang-toggle]. */
export function initI18n() {
  setLocale(getLocale());
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lang-toggle]');
    if (!btn) return;
    setLocale(getLocale() === 'en' ? 'ru' : 'en');
  });
}
