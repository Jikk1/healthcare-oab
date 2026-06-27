import type { FastifyInstance } from 'fastify';
import { ok } from '../../shared/http.js';
import { coxService } from './cox.service.js';
import { CoxFitRequestSchema } from './cox.schema.js';

/**
 * Модель пропорциональных рисков Кокса.
 *  - GET  /v1/cox/demo : готовый демо-анализ на синтетической когорте
 *    (публичный — питает лендинг «демонстрация алгоритмов»; чистые вычисления).
 *  - POST /v1/cox/fit  : подгонка по присланному набору наблюдений
 *    (требует аутентификации; лимиты размера в схеме).
 */
export async function coxRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/cox/demo', async (req) => {
    return ok(coxService.coxDemo(), { requestId: req.correlationId });
  });

  app.post('/v1/cox/fit', { preHandler: app.authenticate }, async (req) => {
    const body = CoxFitRequestSchema.parse(req.body);
    const profiles = body.profiles ?? [];
    const result = coxService.analyzeCox(
      body.observations,
      body.covariateNames,
      profiles,
      body.calibrationHorizon ?? 3,
    );
    return ok(result, { requestId: req.correlationId });
  });
}
