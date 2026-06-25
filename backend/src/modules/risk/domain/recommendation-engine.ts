/**
 * Rule-based intervention generator. Maps modifiable risk factors to concrete,
 * guideline-referenced recommendations with an estimated impact. Pure function
 * so it is trivially testable and reproducible alongside the risk score.
 */
import type { RiskFactors, RiskAssessmentResult } from './risk-engine.js';

export type RecommendationCategory =
  | 'PHARMACOLOGY'
  | 'LIFESTYLE'
  | 'MONITORING'
  | 'DIAGNOSTIC'
  | 'REFERRAL';

export interface GeneratedRecommendation {
  category: RecommendationCategory;
  title: string;
  detail: string;
  impact?: string;
  evidence?: string;
  priority: number;
}

export function generateRecommendations(
  f: RiskFactors,
  r: RiskAssessmentResult,
): GeneratedRecommendation[] {
  const recs: GeneratedRecommendation[] = [];

  if ((f.ldl ?? 0) > 2.6 && !f.onStatins && r.miRisk > 10) {
    recs.push({
      category: 'PHARMACOLOGY',
      title: 'Назначение статинов (аторвастатин 40 мг)',
      detail: `Снижение LDL с ${f.ldl} до <2.6 ммоль/л · соответствие ESC 2021 для пациентов высокого риска`,
      impact: '−14% ИМ',
      evidence: 'ESC/EAS 2021, класс I A',
      priority: 95,
    });
  }

  if (f.smokingStatus === 'CURRENT') {
    recs.push({
      category: 'LIFESTYLE',
      title: 'Программа отказа от курения',
      detail: 'Консультация нарколога + никотин-заместительная терапия · 12-недельный протокол',
      impact: '−11% ИМ',
      evidence: 'USPSTF, класс A',
      priority: 90,
    });
  }

  if ((f.systolicBp ?? 0) > 140) {
    recs.push({
      category: 'PHARMACOLOGY',
      title: 'Контроль АД: периндоприл + амлодипин',
      detail: 'Целевой диапазон 120–130/70–80 мм рт.ст. · мониторинг каждые 2 недели',
      impact: '−8% инсульт',
      evidence: 'ESC/ESH 2023',
      priority: 82,
    });
  }

  if ((f.activityPerWeek ?? 0) < 3) {
    recs.push({
      category: 'LIFESTYLE',
      title: 'Аэробная активность 150 мин/нед',
      detail: 'Умеренная интенсивность · пульсовая зона 60–70% от максимума · 5 раз в неделю',
      impact: '−6% ССЗ',
      evidence: 'WHO 2020',
      priority: 70,
    });
  }

  if ((f.bmi ?? 0) > 27 || (f.hba1c ?? 0) > 5.7) {
    recs.push({
      category: 'LIFESTYLE',
      title: 'DASH-диета + Ω-3 жирные кислоты',
      detail: 'Снижение натрия до 1500 мг/сут · EPA/DHA 2–4 г/сут из жирной рыбы или добавок',
      impact: '−4% ССЗ',
      evidence: 'AHA 2021',
      priority: 60,
    });
  }

  if (r.dmRisk > 15 && (f.hba1c ?? 0) >= 5.7) {
    recs.push({
      category: 'MONITORING',
      title: 'Скрининг предиабета: HbA1c + ОГТТ',
      detail: 'Повтор HbA1c через 3 мес · оральный глюкозотолерантный тест при HbA1c 5.7–6.4%',
      impact: 'Диагностика',
      evidence: 'ADA 2024',
      priority: 55,
    });
  }

  if (r.riskLevel === 'CRITICAL' || r.miRisk > 25) {
    recs.push({
      category: 'DIAGNOSTIC',
      title: 'Расширенная эхокардиография',
      detail:
        'Исключение субклинической ГЛЖ и диастолической дисфункции · в ближайшие 4 недели',
      impact: 'Диагностика',
      evidence: 'ESC 2021',
      priority: 50,
    });
  }

  if ((f.egfr ?? 100) < 60) {
    recs.push({
      category: 'REFERRAL',
      title: 'Консультация нефролога',
      detail: 'СКФ < 60 мл/мин/1.73м² · оценка ХБП, альбумин/креатинин мочи',
      impact: 'Диагностика',
      evidence: 'KDIGO 2024',
      priority: 65,
    });
  }

  return recs.sort((a, b) => b.priority - a.priority);
}
