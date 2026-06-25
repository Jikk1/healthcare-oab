/**
 * Test bootstrap: provides the minimal env the config validator requires so
 * pure-domain suites import cleanly without a real database or Redis. Values are
 * dummies — no test in the unit suite touches the network.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-which-is-long-enough-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-which-is-long-enough-0123456789';
process.env.PHI_ENCRYPTION_KEY ??= 'test-phi-encryption-key-32bytes-minimum-0123456789';
process.env.LOG_LEVEL ??= 'fatal';
