/**
 * Test bootstrap: provides the minimal env the config validator requires so
 * pure-domain suites import cleanly without a real database or Redis. Values are
 * dummies — no test in the unit suite touches the network.
 *
 * With RUN_INTEGRATION=1 the suite talks to the live stack, so real settings
 * from .env are loaded first (vitest itself does not read .env; only the
 * dev/start scripts pass --env-file). Already-exported variables win.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.env.RUN_INTEGRATION) {
  try {
    const envFile = readFileSync(resolve(__dirname, '../.env'), 'utf8');
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* нет .env — интеграционный прогон настроен экспортом переменных (CI) */
  }
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-which-is-long-enough-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-which-is-long-enough-0123456789';
process.env.PHI_ENCRYPTION_KEY ??= 'test-phi-encryption-key-32bytes-minimum-0123456789';
process.env.LOG_LEVEL ??= 'fatal';
