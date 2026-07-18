/* Аутентификация: успешный вход, неверный пароль, живой режим дашборда. */
import { test, expect } from '@playwright/test';
import { login, CLINICIAN } from './helpers.js';

test.describe('auth', () => {
  test('clinician signs in and dashboard goes live', async ({ page }) => {
    await login(page, CLINICIAN);
    await expect(page.locator('body')).toContainText('● Живые данные');
    // Список «Требуют внимания» наполняется живыми пациентами сида.
    await expect(page.locator('#page-overview tbody tr').first()).toBeVisible();
  });

  test('wrong password shows an error, stays on login', async ({ page }) => {
    await page.goto('/login.html');
    await page.fill('#email', CLINICIAN.email);
    await page.fill('#password', 'wrong-password-123');
    await page.click('#submitBtn');
    await expect(page.locator('#authError')).toBeVisible();
    await expect(page).toHaveURL(/login\.html/);
  });

  test('session survives reload (refresh cookie)', async ({ page }) => {
    await login(page, CLINICIAN);
    await page.reload();
    await expect(page.locator('body')).toContainText('● Живые данные');
  });
});
