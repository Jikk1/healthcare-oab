import { z } from 'zod';

/**
 * Strongly-typed, fail-fast configuration.
 * The process refuses to boot if any required variable is missing/invalid —
 * a 12-factor principle that prevents half-configured deployments.
 */
const csv = (value: string): string[] =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SERVICE_NAME: z.string().default('healthcare-oab-api'),
  SERVICE_VERSION: z.string().default('1.0.0'),

  CORS_ORIGINS: z.string().default('http://localhost:5173').transform(csv),
  COOKIE_DOMAIN: z.string().default('localhost'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  JWT_ISSUER: z.string().default('healthcare-oab'),
  JWT_AUDIENCE: z.string().default('healthcare-oab-clients'),

  ARGON_MEMORY_COST: z.coerce.number().int().positive().default(19_456),
  ARGON_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON_PARALLELISM: z.coerce.number().int().positive().default(1),

  PHI_ENCRYPTION_KEY: z.string().min(32),

  MFA_ISSUER: z.string().default('HealthCareOAB+'),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60_000),

  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
  METRICS_ENABLED: z.coerce.boolean().default(true),

  FEATURE_MFA: z.coerce.boolean().default(true),
  FEATURE_BILLING: z.coerce.boolean().default(true),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`\n[config] Invalid environment configuration:\n${issues}\n`);
    throw new Error('Invalid environment configuration');
  }
  cached = parsed.data;
  return cached;
}

export const config: AppConfig = loadConfig();

export const isProd = (): boolean => config.NODE_ENV === 'production';
export const isTest = (): boolean => config.NODE_ENV === 'test';
