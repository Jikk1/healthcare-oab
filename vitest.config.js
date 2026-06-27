import { defineConfig } from 'vitest/config';

// Тесты фронтенда выполняются в jsdom: модули api.js/omnirisk.js — это IIFE,
// которые навешиваются на window и читают document при загрузке.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/frontend/**/*.test.js'],
    globals: false,
    restoreMocks: true,
  },
});
