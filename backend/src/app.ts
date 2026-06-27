import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './config/env.js';
import { loggerOptions } from './shared/logger.js';
import { securityPlugin } from './plugins/security.js';
import { requestContextPlugin } from './plugins/request-context.js';
import { authPlugin } from './plugins/auth.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { organizationRoutes } from './modules/organizations/organization.routes.js';
import { patientRoutes } from './modules/patients/patient.routes.js';
import { predictionRoutes } from './modules/prediction/prediction.routes.js';
import { coxRoutes } from './modules/cox/cox.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { auditRoutes } from './modules/audit/audit.routes.js';

/**
 * Composition root: builds a fully-wired Fastify instance without binding a
 * port. Kept side-effect-free so integration tests can spin up an app with
 * `.inject()` and no network listener.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: true,
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    bodyLimit: 1_048_576, // 1 MiB
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  // Cross-cutting plugins (order matters: context → security → auth → limits → errors).
  await app.register(requestContextPlugin);
  await app.register(securityPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);
  await app.register(errorHandlerPlugin);

  // Operational endpoints.
  await app.register(healthRoutes);

  // Domain routes (all under /v1).
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(organizationRoutes);
  await app.register(patientRoutes);
  await app.register(predictionRoutes);
  await app.register(coxRoutes);
  await app.register(analyticsRoutes);
  await app.register(billingRoutes);
  await app.register(auditRoutes);

  app.get('/', { config: { rateLimit: false } }, async () => ({
    name: config.SERVICE_NAME,
    version: config.SERVICE_VERSION,
    status: 'ok',
    docs: '/health/live',
  }));

  return app;
}
