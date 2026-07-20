/* Общие помощники E2E. Креды — из сида (backend/prisma/seed.ts);
   переопределяются переменными окружения при необходимости. */
import { expect } from '@playwright/test';

export const CLINICIAN = {
  email: process.env.E2E_CLINICIAN_EMAIL || 'clinician@oab-clinic.demo',
  password: process.env.E2E_CLINICIAN_PASSWORD || 'OabDemo_Clinician_2026!',
};
export const OWNER = {
  email: process.env.E2E_OWNER_EMAIL || 'owner@oab-clinic.demo',
  password: process.env.E2E_OWNER_PASSWORD || 'OabDemo_Owner_2026!',
};

/** Вход через форму: после успеха login.js уводит на dashboard.html.
 *  Дожидаемся «● Живые данные»: до завершения тихого refresh дашборд ещё в
 *  демо-режиме и действия уходили бы в клиентские ветки. */
export async function login(page, { email, password }) {
  await page.goto('/login.html');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#submitBtn');
  await page.waitForURL('**/dashboard.html', { timeout: 15_000 });
  await expect(page.locator('body')).toContainText('● Живые данные', { timeout: 15_000 });
}

/** Клик по пункту бокового меню дашборда (div.nav-item, не кнопка). */
export async function switchPage(page, label) {
  await page.locator('.nav-item', { hasText: label }).first().click();
}
