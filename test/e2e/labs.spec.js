/* labs.html: докторский режим, серверный расчёт, сохранение ассессмента. */
import { test, expect } from '@playwright/test';
import { login, CLINICIAN } from './helpers.js';

test.describe('labs → assessment', () => {
  test('doctor saves an assessment to a seeded patient', async ({ page }) => {
    await login(page, CLINICIAN);
    await page.goto('/labs.html');

    // Сессия жива → докторский блок открыт и карты загружены.
    await expect(page.locator('#doctorBox')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#patientSelect option').first()).toBeAttached();

    // Заполняем показатели и возраст. ОАК открыт по умолчанию; остальные
    // секции — закрытые <details>, раскрываем перед вводом.
    await page.fill('#age', '52');
    await page.fill('#hemoglobin', '128');
    await page.locator('details', { hasText: 'Витальные' }).locator('summary').click();
    await page.fill('#systolicBp', '148');
    await page.locator('details', { hasText: 'Гликемия' }).locator('summary').click();
    await page.fill('#hba1c', '6.4');

    // Серверный режим расчёта.
    const predicted = page.waitForResponse((r) => r.url().endsWith('/v1/predict') && r.status() === 200);
    await page.locator('#computeSource button', { hasText: 'Сервер' }).click();
    await predicted;
    await expect(page.locator('#computeHint')).toContainText('сервер');

    // Сохранение в карту первого пациента из списка.
    const assessed = page.waitForResponse((r) => /\/v1\/patients\/.+\/assessments$/.test(r.url()) && r.request().method() === 'POST');
    await page.click('#assessBtn');
    expect((await assessed).status()).toBe(201);
    await expect(page.locator('#assessResult')).toContainText('Сохранено');
    await expect(page.locator('#assessResult')).toContainText('Риск');
  });

  test('demo mode computes without a session', async ({ page }) => {
    await page.goto('/labs.html');
    await page.fill('#age', '44');
    await page.fill('#hemoglobin', '115');
    // Локальный расчёт: KPI и флаг отклонения появляются без сети.
    await expect(page.locator('#kpis .or-kpi').first()).toBeVisible();
    await expect(page.locator('#flags')).toContainText('Гемоглобин');
  });
});
