/* CRUD пациента через модалку дашборда: create → edit → archive (уборка). */
import { test, expect } from '@playwright/test';
import { login, switchPage, CLINICIAN } from './helpers.js';

test.describe('patient CRUD', () => {
  test('create, edit and archive a patient', async ({ page }) => {
    const mrn = `E2E-${Date.now()}`;
    await login(page, CLINICIAN);
    await switchPage(page, 'Пациенты');

    // Создание.
    await page.locator('#page-patients button', { hasText: 'Добавить' }).click();
    await page.fill('#fLast', 'Тестова');
    await page.fill('#fFirst', 'Пациентка');
    await page.selectOption('#fSex', 'FEMALE');
    await page.fill('#fAge', '37');
    await page.fill('#fMrn', mrn);
    const created = page.waitForResponse((r) => r.url().endsWith('/v1/patients') && r.request().method() === 'POST');
    await page.click('#fSave');
    expect((await created).status()).toBe(201);
    const row = page.locator('#page-patients tbody tr', { hasText: mrn });
    await expect(row).toBeVisible();

    // Редактирование (префилл + PATCH). Кнопка в строке — «✎» с title.
    await row.locator('button[title="Редактировать"]').click();
    await expect(page.locator('#fLast')).toHaveValue('Тестова');
    await page.fill('#fAge', '38');
    const updated = page.waitForResponse((r) => r.url().includes('/v1/patients/') && r.request().method() === 'PATCH');
    await page.click('#fSave');
    expect((await updated).status()).toBe(200);
    await expect(page.locator('#page-patients tbody tr', { hasText: mrn })).toContainText('38');

    // Архивация (уборка за собой): подтверждаем confirm().
    page.on('dialog', (d) => d.accept());
    await page.locator('#page-patients tbody tr', { hasText: mrn }).locator('button[title="Редактировать"]').click();
    const archived = page.waitForResponse((r) => r.url().includes('/v1/patients/') && r.request().method() === 'DELETE');
    await page.click('#fArchive');
    expect([200, 204]).toContain((await archived).status());
    await expect(page.locator('#page-patients tbody tr', { hasText: mrn })).toHaveCount(0);
  });

  test('server-side search filters the table', async ({ page }) => {
    await login(page, CLINICIAN);
    await switchPage(page, 'Пациенты');
    await expect(page.locator('#page-patients tbody tr').first()).toBeVisible();
    const searched = page.waitForResponse((r) => r.url().includes('search=') && r.status() === 200);
    await page.fill('#patientSearch', 'Морозов');
    await searched;
    await expect(page.locator('#page-patients tbody tr', { hasText: 'Морозов' }).first()).toBeVisible();
    await expect(page.locator('#page-patients tbody tr', { hasText: 'Серебрякова' })).toHaveCount(0);
  });
});
