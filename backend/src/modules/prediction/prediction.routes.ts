import type { FastifyInstance } from 'fastify';
import { ok } from '../../shared/http.js';
import { actorFrom } from '../patients/actor.js';
import { predictionService } from './prediction.service.js';
import { HealthProfileSchema, InterventionSchema } from './prediction.schema.js';
import { DISEASES } from './domain/disease-catalog.js';
import { CATEGORY_LABELS, DISEASE_CATEGORIES } from './domain/health-profile.js';

/**
 * OmniRisk — универсальное прогнозирование рисков.
 * Все маршруты требуют аутентификации; вычисление прогноза доступно любой роли
 * с доступом (чтение), так как не модифицирует данные пациента. Прогнозы по
 * чужому пациенту защищены tenant-изоляцией в репозитории.
 */
export async function predictionRoutes(app: FastifyInstance): Promise<void> {
  // Метаданные движка — паспорт модели и каталог болезней.
  app.get('/v1/predict/model', { preHandler: app.authenticate }, async (req) => {
    return ok(predictionService.modelCard(), { requestId: req.correlationId });
  });

  app.get('/v1/predict/catalog', { preHandler: app.authenticate }, async (req) => {
    return ok(
      {
        categories: DISEASE_CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABELS[c] })),
        diseases: DISEASES.map((d) => ({
          id: d.id,
          icd11: d.icd11,
          name: d.name,
          category: d.category,
          stage: d.stage ?? 'overt',
        })),
        total: DISEASES.length,
      },
      { requestId: req.correlationId },
    );
  });

  // Прогноз по свободному мультимодальному профилю.
  app.post('/v1/predict', { preHandler: app.authenticate }, async (req) => {
    const body = HealthProfileSchema.parse(req.body);
    const result = await predictionService.predict(actorFrom(req), body);
    return ok(result, { requestId: req.correlationId });
  });

  // Контрфактическое моделирование вмешательства.
  app.post('/v1/predict/intervention', { preHandler: app.authenticate }, async (req) => {
    const raw = req.body as { profile?: unknown; overrides?: unknown };
    const profile = HealthProfileSchema.parse(raw.profile);
    const { overrides } = InterventionSchema.parse({ overrides: raw.overrides ?? {} });
    const delta = await predictionService.simulate(actorFrom(req), profile, overrides);
    return ok(delta, { requestId: req.correlationId });
  });

  // Прогноз для существующего пациента (профиль из сохранённых биомаркеров).
  app.get('/v1/patients/:id/predict', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const result = await predictionService.predictForPatient(actorFrom(req), id);
    return ok(result, { requestId: req.correlationId });
  });
}
