import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Многостраничное приложение: каждая HTML-страница — отдельная точка входа.
// Общие модули (api.js, omnirisk.js, chart.js, lenis) Vite вынесет в общие чанки.
const page = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Дев-сервер слушает только localhost (как и прежняя статика), порт 5173 —
  // совпадает с CORS_ORIGINS бэкенда по умолчанию.
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 5173 },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        index: page('./index.html'),
        cox: page('./cox.html'),
        coxDemo: page('./cox-demo.html'),
        dashboard: page('./dashboard.html'),
        predict: page('./predict.html'),
        login: page('./login.html'),
        labs: page('./labs.html'),
      },
    },
  },
});
