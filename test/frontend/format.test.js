import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../lib/format.js';

describe('escapeHtml', () => {
  it('экранирует опасные символы HTML', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });
  it('экранирует кавычки (безопасно для атрибутов)', () => {
    expect(escapeHtml('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)');
    expect(escapeHtml("O'Brien")).toBe('O&#39;Brien');
  });
  it('null/undefined → пустая строка', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('числа приводятся к строке', () => {
    expect(escapeHtml(42)).toBe('42');
  });
  it('обычный текст без спецсимволов не меняется', () => {
    expect(escapeHtml('Петров Иван')).toBe('Петров Иван');
  });
  it('не оставляет исполняемого тега после экранирования', () => {
    expect(escapeHtml('<script>x</script>')).not.toContain('<script>');
  });
});
