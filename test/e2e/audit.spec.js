/* Аудит-журнал: RBAC (клиницисту отказ) и целостность цепочки под OWNER. */
import { test, expect } from '@playwright/test';
import { login, switchPage, CLINICIAN, OWNER } from './helpers.js';

test.describe('audit log', () => {
  test('clinician is denied (OWNER/ADMIN only)', async ({ page }) => {
    await login(page, CLINICIAN);
    await switchPage(page, 'Аудит');
    await expect(page.locator('#page-audit')).toContainText('OWNER/ADMIN');
  });

  test('owner sees entries and chain verifies intact', async ({ page }) => {
    await login(page, OWNER);
    await switchPage(page, 'Аудит');
    await expect(page.locator('#page-audit tbody tr').first()).toBeVisible({ timeout: 15_000 });

    const verified = page.waitForResponse((r) => r.url().includes('/v1/audit') && r.url().includes('verify'));
    await page.locator('#page-audit button', { hasText: 'целостность' }).click();
    await verified;
    await expect(page.locator('#auditVerifyResult')).toContainText('✓');
  });
});
