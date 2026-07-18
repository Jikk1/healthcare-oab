/* ============================================================
   Playwright E2E — живой стек: vite (:5173) + API (:8080, Docker).
   ------------------------------------------------------------
   Запуск: npm run test:e2e (поднимите стек заранее — см. README:
   docker compose -f backend/docker-compose.yml up -d postgres redis api
   + npx prisma migrate deploy && npx prisma db seed из backend/).
   Дев-сервер vite поднимется сам, если ещё не запущен.
   ============================================================ */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: false, // общая БД: сценарии с записью идут последовательно
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
