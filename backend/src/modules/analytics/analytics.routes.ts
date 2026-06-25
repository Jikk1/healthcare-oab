import type { FastifyInstance } from 'fastify';
import { ok } from '../../shared/http.js';
import { analyticsService } from './analytics.service.js';

/** Population analytics — read-only, available to any authenticated member. */
export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/analytics/summary', { preHandler: app.authenticate }, async (req) => {
    const org = req.auth!.organizationId;
    return ok(await analyticsService.summary(org), { requestId: req.correlationId });
  });

  app.get('/v1/analytics/risk-distribution', { preHandler: app.authenticate }, async (req) => {
    const org = req.auth!.organizationId;
    return ok(await analyticsService.riskDistribution(org), { requestId: req.correlationId });
  });

  app.get('/v1/analytics/bio-age', { preHandler: app.authenticate }, async (req) => {
    const org = req.auth!.organizationId;
    return ok(await analyticsService.bioAgeByBand(org), { requestId: req.correlationId });
  });

  app.get('/v1/analytics/heatmap', { preHandler: app.authenticate }, async (req) => {
    const org = req.auth!.organizationId;
    return ok(await analyticsService.riskHeatmap(org), { requestId: req.correlationId });
  });
}
