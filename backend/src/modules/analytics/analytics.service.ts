import type { RiskLevel } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';

/**
 * Read-optimised population analytics. In production these aggregates would be
 * served from a read replica / materialised views (or an OLAP store) refreshed
 * by the risk.assessed event stream; here we compute them directly with
 * tenant-scoped GROUP BY queries.
 */

const AGE_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: '20–29', min: 20, max: 29 },
  { label: '30–39', min: 30, max: 39 },
  { label: '40–49', min: 40, max: 49 },
  { label: '50–59', min: 50, max: 59 },
  { label: '60–69', min: 60, max: 69 },
  { label: '70+', min: 70, max: 200 },
];

export const analyticsService = {
  async summary(organizationId: string) {
    const [total, byLevelRaw, agg] = await Promise.all([
      prisma.patient.count({ where: { organizationId, isArchived: false } }),
      prisma.patient.groupBy({
        by: ['latestRiskLevel'],
        where: { organizationId, isArchived: false, latestRiskLevel: { not: null } },
        _count: { _all: true },
      }),
      prisma.patient.aggregate({
        where: { organizationId, isArchived: false, latestBioAge: { not: null } },
        _avg: { latestBioAge: true, ageYears: true, latestCvRisk: true },
      }),
    ]);

    const byLevel: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const row of byLevelRaw) {
      if (row.latestRiskLevel) byLevel[row.latestRiskLevel] = row._count._all;
    }

    const avgBio = agg._avg.latestBioAge ?? 0;
    const avgChrono = agg._avg.ageYears ?? 0;

    return {
      totalPatients: total,
      byLevel,
      avgCvRisk: round1(agg._avg.latestCvRisk ?? 0),
      avgBioAgeGap: round1(avgBio - avgChrono),
      modelAuc: 0.847, // last validation run; surfaced from the model registry in prod
      modelVersion: 'oab-risk-2.1.0',
    };
  },

  async riskDistribution(organizationId: string) {
    const rows = await prisma.patient.groupBy({
      by: ['latestRiskLevel'],
      where: { organizationId, isArchived: false },
      _count: { _all: true },
    });
    const map: Record<string, number> = {};
    for (const r of rows) map[r.latestRiskLevel ?? 'UNSCORED'] = r._count._all;
    return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => ({
      level,
      count: map[level] ?? 0,
    }));
  },

  async bioAgeByBand(organizationId: string) {
    const patients = await prisma.patient.findMany({
      where: { organizationId, isArchived: false, latestBioAge: { not: null } },
      select: { ageYears: true, latestBioAge: true },
    });
    return AGE_BANDS.map((band) => {
      const inBand = patients.filter((p) => p.ageYears >= band.min && p.ageYears <= band.max);
      const chrono = avg(inBand.map((p) => p.ageYears));
      const bio = avg(inBand.map((p) => p.latestBioAge ?? 0));
      return { band: band.label, count: inBand.length, chronoAge: round1(chrono), bioAge: round1(bio) };
    });
  },

  /** Average per-domain risk by age band — feeds the dashboard heatmap. */
  async riskHeatmap(organizationId: string) {
    const assessments = await prisma.riskAssessment.findMany({
      where: { patient: { organizationId, isArchived: false } },
      select: { chronoAge: true, cvRisk: true, dmRisk: true, oncoRisk: true, ckdRisk: true, neuroRisk: true },
    });
    const cols = ['ССЗ', 'СД2', 'Онко', 'ХБП', 'Когн.'] as const;
    const rows = AGE_BANDS.map((band) => {
      const inBand = assessments.filter((a) => a.chronoAge >= band.min && a.chronoAge <= band.max);
      return {
        band: band.label,
        values: [
          round1(avg(inBand.map((a) => a.cvRisk))),
          round1(avg(inBand.map((a) => a.dmRisk))),
          round1(avg(inBand.map((a) => a.oncoRisk))),
          round1(avg(inBand.map((a) => a.ckdRisk))),
          round1(avg(inBand.map((a) => a.neuroRisk))),
        ],
      };
    });
    return { columns: cols, rows };
  },
};

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
