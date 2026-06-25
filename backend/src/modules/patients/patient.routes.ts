import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/prisma.js';
import { ok } from '../../shared/http.js';
import { actorFrom } from './actor.js';
import { patientService } from './patient.service.js';
import { riskService } from '../risk/risk.service.js';
import {
  BiomarkerBody,
  CreatePatientBody,
  ListPatientsQuery,
  UpdatePatientBody,
} from './patient.schema.js';

/**
 * Patient + clinical endpoints. All require authentication; mutations require
 * a clinical/admin role. Tenant isolation is enforced in the repository layer.
 */
export async function patientRoutes(app: FastifyInstance): Promise<void> {
  const writeRoles = app.requireRole('OWNER', 'ADMIN', 'CLINICIAN');

  app.get('/v1/patients', { preHandler: app.authenticate }, async (req) => {
    const query = ListPatientsQuery.parse(req.query);
    const result = await patientService.list(actorFrom(req), query);
    return ok(result, { requestId: req.correlationId });
  });

  app.post('/v1/patients', { preHandler: [app.authenticate, writeRoles] }, async (req, reply) => {
    const body = CreatePatientBody.parse(req.body);
    const created = await patientService.create(actorFrom(req), body);
    reply.status(201);
    return ok(created, { requestId: req.correlationId });
  });

  app.get('/v1/patients/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const p = await patientService.get(actorFrom(req), id);
    return ok(p, { requestId: req.correlationId });
  });

  app.patch('/v1/patients/:id', { preHandler: [app.authenticate, writeRoles] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = UpdatePatientBody.parse(req.body);
    const updated = await patientService.update(actorFrom(req), id, body);
    return ok(updated, { requestId: req.correlationId });
  });

  app.delete('/v1/patients/:id', { preHandler: [app.authenticate, writeRoles] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await patientService.archive(actorFrom(req), id);
    reply.status(204);
  });

  // ---- Clinical risk ----

  app.post(
    '/v1/patients/:id/assessments',
    { preHandler: [app.authenticate, writeRoles] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = BiomarkerBody.parse(req.body);
      const { result, recommendations } = await riskService.assess(actorFrom(req), id, body);
      reply.status(201);
      return ok({ assessment: result, recommendations }, { requestId: req.correlationId });
    },
  );

  app.get('/v1/patients/:id/assessments/latest', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const latest = await riskService.latest(actorFrom(req), id);
    return ok(latest, { requestId: req.correlationId });
  });

  app.post('/v1/patients/:id/scenario', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const overrides = BiomarkerBody.partial().parse(req.body ?? {});
    const projection = await riskService.simulate(actorFrom(req), id, overrides);
    return ok(projection, { requestId: req.correlationId });
  });

  app.get('/v1/patients/:id/recommendations', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const actor = actorFrom(req);
    // Ensure the patient belongs to the tenant before exposing recommendations.
    await patientService.get(actor, id);
    const recs = await prisma.recommendation.findMany({
      where: { patientId: id },
      orderBy: { priority: 'desc' },
    });
    return ok(recs, { requestId: req.correlationId });
  });
}
