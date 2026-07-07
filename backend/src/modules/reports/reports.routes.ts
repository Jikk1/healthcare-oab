import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ok } from '../../shared/http.js';
import { actorFrom } from '../patients/actor.js';
import { reportsService } from './reports.service.js';

/**
 * Отчётность: данные кольцевых диаграмм + динамика (JSON) и экспорт в Excel/PDF.
 * Тенант и пользователь берутся из JWT (не из query). Выгрузка отчёта пациента
 * (ПДн) ограничена ролями и не кэшируется; факт выгрузки пишется в аудит.
 */

const PeriodQuery = z.object({
  period: z.enum(['month', 'quarter', 'year', 'all']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
const ExportQuery = PeriodQuery.extend({ format: z.enum(['xlsx', 'pdf']).default('xlsx') });

function sendFile(reply: FastifyReply, buffer: Uint8Array, filename: string, contentType: string) {
  return reply
    .type(contentType)
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .header('Cache-Control', 'no-store') // ПДн — запрещаем кэширование
    .send(buffer);
}

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/reports/doctor/stats', { preHandler: app.authenticate }, async (req) => {
    const q = PeriodQuery.parse(req.query);
    return ok(await reportsService.doctorReport(req.auth!.organizationId, q), {
      requestId: req.correlationId,
    });
  });

  app.get('/v1/reports/patient/:id/stats', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const q = PeriodQuery.parse(req.query);
    return ok(await reportsService.patientReport(actorFrom(req), id, q), {
      requestId: req.correlationId,
    });
  });

  app.get('/v1/reports/doctor/export', { preHandler: app.authenticate }, async (req, reply) => {
    const q = ExportQuery.parse(req.query);
    const { buffer, filename, contentType } = await reportsService.doctorExport(actorFrom(req), q);
    return sendFile(reply, buffer, filename, contentType);
  });

  // Выгрузка ПДн отдельного пациента — только клинические/административные роли.
  app.get(
    '/v1/reports/patient/:id/export',
    { preHandler: [app.authenticate, app.requireRole('OWNER', 'ADMIN', 'CLINICIAN')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const q = ExportQuery.parse(req.query);
      const { buffer, filename, contentType } = await reportsService.patientExport(actorFrom(req), id, q);
      return sendFile(reply, buffer, filename, contentType);
    },
  );
}
