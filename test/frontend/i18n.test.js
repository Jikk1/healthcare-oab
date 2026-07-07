import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EN } from '../../locales/en.js';
import { setLocale } from '../../lib/i18n.js';

// Страницы, где размечен data-i18n (dashboard пока RU — намеренно).
const FILES = ['index', 'cox', 'cox-demo', 'predict', 'labs', 'login'].map((f) => `${f}.html`);

const read = (rel) => readFileSync(fileURLToPath(new URL('../../' + rel, import.meta.url)), 'utf8');

describe('i18n coverage', () => {
  it('every data-i18n / data-i18n-html / data-i18n-attr key in markup has an EN entry', () => {
    const missing = [];
    for (const f of FILES) {
      const html = read(f);
      const textKeys = [...html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]);
      const attrKeys = [...html.matchAll(/data-i18n-attr="([^"]+)"/g)]
        .flatMap((m) => m[1].split(';').map((p) => p.split(':')[1]?.trim()))
        .filter(Boolean);
      for (const k of [...textKeys, ...attrKeys]) if (!(k in EN)) missing.push(`${f}: ${k}`);
    }
    expect(missing).toEqual([]);
  });

  it('no orphan EN keys (every key is referenced in markup)', () => {
    const all = FILES.map(read).join('\n');
    const used = new Set([
      ...[...all.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]),
      ...[...all.matchAll(/data-i18n-attr="([^"]+)"/g)]
        .flatMap((m) => m[1].split(';').map((p) => p.split(':')[1]?.trim()))
        .filter(Boolean),
    ]);
    const orphans = Object.keys(EN).filter((k) => !used.has(k));
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
