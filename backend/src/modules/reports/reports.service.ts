import type { RiskLevel } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { patientService, type ActorContext } from '../patients/patient.service.js';
import { auditService } from '../audit/audit.service.js';
import {
  toDoctorDonut,
  toPatientDonut,
  toDoctorTrend,
  toPatientTrend,
  resolvePeriod,
  type DonutReport,
} from './reports.domain.js';
import { buildReportWorkbook } from './excel.js';
import { buildReportPdf } from './pdf.js';

/**
 * Reporting — кольцевые отчёты, динамика во времени, фильтр по периоду и экспорт
 * в Excel/PDF.
 *
 * Доступ — мультитенантный: «пациенты врача» = пациенты его организации
 * (`organizationId` из JWT). Индивидуальные отчёты проходят через
 * `patientService.get` (проверка принадлежности + расшифровка ФИО + аудит чтения).
 * Экспорт (выгрузка ПДн) дополнительно фиксируется в аудит-журнале.
 */

export interface PeriodInput {
  period?: string;
  from?: string;
  to?: string;
}
export type ReportFormat = 'xlsx' | 'pdf';

const EXPORT_META: Record<ReportFormat, { ext: string; mime: string }> = {
  xlsx: {
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  pdf: { ext: 'pdf', mime: 'application/pdf' },
};

export const reportsService = {
  /** Агрегат по кабинету: распределение пациентов по риску + динамика среднего риска. */
  async doctorReport(organizationId: string, periodInput: PeriodInput = {}): Promise<DonutReport> {
    const rows = await prisma.patient.groupBy({
      by: ['latestRiskLevel'],
      where: { organizationId, isArchived: false, latestRiskLevel: { not: null } },
      _count: { _all: true },
    });
    const byLevel: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const r of rows) if (r.latestRiskLevel) byLevel[r.latestRiskLevel] = r._count._all;
    const report = toDoctorDonut(byLevel);

    const period = resolvePeriod(periodInput);
    const assessments = await prisma.riskAssessment.findMany({
      where: {
        patient: { organizationId, isArchived: false },
        computedAt: { gte: period.from, lte: period.to },
      },
      select: { computedAt: true, overallRisk: true },
    });
    report.period = { key: period.key, label: period.label };
    report.trend = toDoctorTrend(assessments);
    report.generatedAt = new Date().toISOString();
    return report;
  },

  /** Индивидуальный профиль пациента + динамика интегрального риска. */
  async patientReport(
    actor: ActorContext,
    patientId: string,
    periodInput: PeriodInput = {},
  ): Promise<DonutReport> {
    const patient = await patientService.get(actor, patientId); // ownership + NotFound + ФИО + аудит
    const period = resolvePeriod(periodInput);

    const history = await prisma.riskAssessment.findMany({
      where: { patientId, computedAt: { gte: period.from, lte: period.to } },
      orderBy: { computedAt: 'asc' },
      select: {
        computedAt: true,
        overallRisk: true,
        miRisk: true,
        strokeRisk: true,
        dmRisk: true,
        oncoRisk: true,
        ckdRisk: true,
        neuroRisk: true,
      },
    });
    const latest = history[history.length - 1];

    const report: DonutReport = latest
      ? toPatientDonut({ fullName: patient.fullName, ...latest })
      : {
          title: `Профиль риска · ${patient.fullName}`,
          subtitle: 'Нет данных ассессмента за период',
          centerValue: '—',
          unit: '%',
          segments: [],
        };
    report.period = { key: period.key, label: period.label };
    report.trend = toPatientTrend(history);
    report.generatedAt = new Date().toISOString();
    return report;
  },

  /** Excel/PDF-выгрузка агрегата кабинета (фиксируется в аудите). */
  async doctorExport(
    actor: ActorContext,
    opts: PeriodInput & { format: ReportFormat },
  ): Promise<{ buffer: Uint8Array; filename: string; contentType: string }> {
    const report = await this.doctorReport(actor.organizationId, opts);
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'report.doctor.export',
      resourceType: 'report',
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: { format: opts.format, period: report.period?.key },
    });
    return this.pack(report, opts.format, 'doctor_report');
  },

  /** Excel/PDF-выгрузка отчёта пациента (выгрузка ПДн — фиксируется в аудите). */
  async patientExport(
    actor: ActorContext,
    patientId: string,
    opts: PeriodInput & { format: ReportFormat },
  ): Promise<{ buffer: Uint8Array; filename: string; contentType: string }> {
    const report = await this.patientReport(actor, patientId, opts);
    await auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'report.patient.export',
      resourceType: 'patient',
      resourceId: patientId,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
      metadata: { format: opts.format, period: report.period?.key },
    });
    return this.pack(report, opts.format, `patient_${patientId}_report`);
  },

  async pack(
    report: DonutReport,
    format: ReportFormat,
    base: string,
  ): Promise<{ buffer: Uint8Array; filename: string; contentType: string }> {
    const { ext, mime } = EXPORT_META[format];
    const buffer = format === 'pdf' ? await buildReportPdf(report) : await buildReportWorkbook(report);
    return { buffer, filename: `${base}.${ext}`, contentType: mime };
  },
};
