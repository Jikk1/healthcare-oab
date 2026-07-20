import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EN } from '../../locales/en.js';
import { setLocale } from '../../lib/i18n.js';

// Страницы, где размечен data-i18n (dashboard пока RU — намеренно).
const FILES = ['index', 'cox', 'cox-demo', 'predict', 'labs', 'login'].map((f) => `${f}.html`);
// JS с t()-строками и data-i18n в генерируемой разметке (ADR-0008).
const JS_FILES = ['labs.js', 'predict.js', 'lib/omni-render.js'];

const read = (rel) => readFileSync(fileURLToPath(new URL('../../' + rel, import.meta.url)), 'utf8');

/** Ключи из разметки/шаблонов. Динамические (`labsj.f.${f.id}`, `'orj.level.' + lvl`)
 *  сводятся к префиксу с точкой на конце. */
function extractKeys(src) {
  const statics = [];
  const prefixes = [];
  const push = (raw) => {
    const cut = raw.indexOf('${');
    const key = cut === -1 ? raw : raw.slice(0, cut);
    if (key !== raw || key.endsWith('.')) { if (key) prefixes.push(key); } else statics.push(key);
  };
  for (const m of src.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) push(m[1]);
  for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(';')) { const k = pair.split(':')[1]?.trim(); if (k) push(k); }
  }
  for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) push(m[1]);
  return { statics, prefixes };
}

describe('i18n coverage', () => {
  it('every i18n key in markup and JS has an EN entry', () => {
    const missing = [];
    for (const f of [...FILES, ...JS_FILES]) {
      const { statics, prefixes } = extractKeys(read(f));
      for (const k of statics) if (!(k in EN)) missing.push(`${f}: ${k}`);
      for (const p of prefixes) if (!Object.keys(EN).some((k) => k.startsWith(p))) missing.push(`${f}: ${p}* (dynamic)`);
    }
    expect(missing).toEqual([]);
  });

  it('no orphan EN keys (every key is referenced in markup or JS)', () => {
    const all = [...FILES, ...JS_FILES].map(read).join('\n');
    const { statics, prefixes } = extractKeys(all);
    const used = new Set(statics);
    const orphans = Object.keys(EN).filter((k) => !used.has(k) && !prefixes.some((p) => k.startsWith(p)));
    expect(orphans).toEqual([]);
  });
});

describe('i18n runtime (jsdom)', () => {
  it('setLocale swaps text content and toggles <html lang>, then restores', () => {
    document.body.innerHTML = '<h1 data-i18n="nav.cox">Модель Кокса</h1>';
    setLocale('en');
    expect(document.querySelector('h1').textContent).toBe('Cox Model');
    expect(document.documentElement.lang).toBe('en');
    setLocale('ru');
    expect(document.querySelector('h1').textContent).toBe('Модель Кокса');
    expect(document.documentElement.lang).toBe('ru');
  });

  it('data-i18n-html swaps innerHTML (markup preserved)', () => {
    document.body.innerHTML =
      '<h2 data-i18n-html="feat.h2">Мощные инструменты<br><span class="gradient-text">клинической аналитики</span></h2>';
    setLocale('en');
    expect(document.querySelector('h2 .gradient-text').textContent).toBe('for clinical analytics');
    setLocale('ru');
    expect(document.querySelector('h2 .gradient-text').textContent).toBe('клинической аналитики');
  });

  it('data-i18n-attr swaps an attribute and restores', () => {
    document.body.innerHTML =
      '<input data-i18n-attr="placeholder:cta.email" placeholder="Ваш рабочий email" />';
    setLocale('en');
    expect(document.querySelector('input').placeholder).toBe('Your work email');
    setLocale('ru');
    expect(document.querySelector('input').placeholder).toBe('Ваш рабочий email');
  });
});
