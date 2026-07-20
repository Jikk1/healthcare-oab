/* Публичные страницы: лендинг, i18n-переключатель, cox-demo с живого API. */
import { test, expect } from '@playwright/test';

test.describe('public pages', () => {
  test('index renders hero and switches to EN and back', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HealthCareOAB\+/);
    await expect(page.locator('h1')).toContainText('Прогностическая медицина');

    // dispatchEvent: шапка лендинга анимируется при входе (кнопка на старте
    // вне вьюпорта) — тест проверяет подмену словаря, а не кликабельность,
    // клик доставляем прямо в делегированный слушатель i18n.
    await page.locator('[data-lang-toggle]').first().dispatchEvent('click');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('h1')).toContainText('Predictive medicine');

    await page.locator('[data-lang-toggle]').first().dispatchEvent('click');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  });

  test('cox-demo loads live engine output', async ({ page }) => {
    const demoResponse = page.waitForResponse((r) => r.url().includes('/v1/cox/demo'), { timeout: 15_000 });
    await page.goto('/cox-demo.html');
    expect((await demoResponse).status()).toBe(200);
    // Форест-плот β/HR отрисован строками с данными движка.
    await expect(page.locator('#forest > *').first()).toBeVisible();
    await expect(page.locator('body')).toContainText('C-index');
  });

  test('predict computes locally in demo mode', async ({ page }) => {
    await page.goto('/predict.html');
    // KPI отрисованы движком в браузере (демо-режим, без сети).
    await expect(page.locator('#kpis .or-kpi').first()).toBeVisible();
    await expect(page.locator('#kpis')).toContainText('Индекс здоровья');
    // Слайдер меняет профиль — KPI пересчитываются без ошибок.
    await page.locator('#sbp').fill('170');
    await expect(page.locator('#kpis .or-kpi').first()).toBeVisible();
    // Переключение EN переводит и JS-рендеры (t()).
    await page.locator('[data-lang-toggle]').first().click();
    await expect(page.locator('#kpis')).toContainText('Health index');
    await page.locator('[data-lang-toggle]').first().click();
  });
});
