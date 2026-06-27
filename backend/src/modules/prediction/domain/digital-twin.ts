/**
 * ============================================================
 * OmniRisk — Цифровой двойник человека
 * (раздел плана «ЦИФРОВОЙ ДВОЙНИК ЧЕЛОВЕКА»)
 * ============================================================
 *
 * Модель организма как набора взаимосвязанных систем. Для каждой системы
 * вычисляется текущий «индекс здоровья» (0..100), прогноз его деградации на
 * годы вперёд и отклик на вмешательства (изменение образа жизни / терапию).
 *
 * Системы и связи упрощены, но взаимовлияют: например, ухудшение метаболизма
 * тянет вниз сердечно-сосудистую и печёночную системы — это даёт правдоподобную
 * динамику «что будет, если...».
 */
import type { NormalizedProfile, ModalitySignals } from './feature-space.js';

export type OrganSystem =
  | 'cardiovascular'
  | 'endocrine'
  | 'immune'
  | 'nervous'
  | 'microbiome'
  | 'metabolic'
  | 'renal'
  | 'hepatic';

export interface SystemState {
  system: OrganSystem;
  label: string;
  health: number; // 0..100
}

export interface TwinProjectionPoint {
  yearOffset: number;
  systems: Record<OrganSystem, number>;
  overall: number;
}

export interface DigitalTwin {
  current: SystemState[];
  /** Проекция без вмешательства на 10 лет (срез каждые 2 года). */
  baselineTrajectory: TwinProjectionPoint[];
  /** Проекция при полном соблюдении рекомендаций. */
  optimizedTrajectory: TwinProjectionPoint[];
  overallNow: number;
}

const LABELS: Record<OrganSystem, string> = {
  cardiovascular: 'Сердечно-сосудистая',
  endocrine: 'Эндокринная',
  immune: 'Иммунная',
  nervous: 'Нервная',
  microbiome: 'Микробиом',
  metabolic: 'Метаболизм',
  renal: 'Почечная',
  hepatic: 'Печёночная',
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Какие сигналы тянут систему вниз (вес — сила влияния). */
const SYSTEM_DRIVERS: Record<OrganSystem, Partial<Record<keyof ModalitySignals, number>>> = {
  cardiovascular: { bloodPressure: 1.0, lipids: 0.9, smoking: 0.8, glycemia: 0.5, autonomic: 0.5, inflammation: 0.4, age: 0.6, cardiac: 0.7 },
  endocrine: { glycemia: 1.2, adiposity: 0.9, inactivity: 0.5, diet: 0.4 },
  immune: { inflammation: 1.0, immune: 0.8, microbiome: 0.5, age: 0.4, stress: 0.4, hematologic: 0.4 },
  nervous: { age: 0.8, bloodPressure: 0.4, glycemia: 0.4, stress: 0.6, sleep: 0.5, social: 0.5, genomicLoad: 0.4 },
  microbiome: { microbiome: 1.2, diet: 0.7, inflammation: 0.4 },
  metabolic: { adiposity: 1.0, glycemia: 1.0, lipids: 0.6, inactivity: 0.6, diet: 0.5 },
  renal: { renal: 1.4, bloodPressure: 0.7, glycemia: 0.6, age: 0.4 },
  hepatic: { hepatic: 1.2, adiposity: 0.8, alcohol: 0.9, glycemia: 0.5 },
};

/** Межсистемные связи: ухудшение одной системы давит на другую (доля). */
const COUPLING: Array<[OrganSystem, OrganSystem, number]> = [
  ['metabolic', 'cardiovascular', 0.25],
  ['metabolic', 'hepatic', 0.2],
  ['metabolic', 'renal', 0.18],
  ['cardiovascular', 'renal', 0.15],
  ['cardiovascular', 'nervous', 0.12],
  ['immune', 'microbiome', 0.15],
  ['microbiome', 'immune', 0.15],
  ['endocrine', 'metabolic', 0.2],
];

function systemHealth(signals: ModalitySignals, system: OrganSystem): number {
  const drivers = SYSTEM_DRIVERS[system];
  let damage = 0;
  for (const [sig, w] of Object.entries(drivers)) {
    damage += Math.max(0, signals[sig as keyof ModalitySignals]) * (w ?? 0);
  }
  return clamp(100 - damage * 14, 5, 100);
}

/** Один шаг старения систем (1 год) с межсистемным сцеплением. */
function step(state: Record<OrganSystem, number>, agingRate: number): Record<OrganSystem, number> {
  const next = { ...state };
  // Базовая возрастная деградация.
  for (const sys of Object.keys(next) as OrganSystem[]) {
    next[sys] = clamp(next[sys] - agingRate, 5, 100);
  }
  // Сцепление: слабая система тянет связанную.
  for (const [from, to, k] of COUPLING) {
    const deficit = 100 - state[from];
    next[to] = clamp(next[to] - deficit * k * 0.02, 5, 100);
  }
  return next;
}

function overall(state: Record<OrganSystem, number>): number {
  const vals = Object.values(state);
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function project(
  start: Record<OrganSystem, number>,
  agingRate: number,
  years: number,
): TwinProjectionPoint[] {
  const points: TwinProjectionPoint[] = [];
  let state = { ...start };
  for (let y = 0; y <= years; y++) {
    if (y > 0) state = step(state, agingRate);
    if (y % 2 === 0) {
      points.push({ yearOffset: y, systems: { ...roundState(state) }, overall: overall(state) });
    }
  }
  return points;
}

function roundState(s: Record<OrganSystem, number>): Record<OrganSystem, number> {
  const out = {} as Record<OrganSystem, number>;
  for (const k of Object.keys(s) as OrganSystem[]) out[k] = round1(s[k]);
  return out;
}

export function buildDigitalTwin(profile: NormalizedProfile): DigitalTwin {
  const systems = Object.keys(LABELS) as OrganSystem[];
  const startState = {} as Record<OrganSystem, number>;
  for (const sys of systems) startState[sys] = systemHealth(profile.signals, sys);

  const current: SystemState[] = systems.map((sys) => ({
    system: sys,
    label: LABELS[sys],
    health: round1(startState[sys]),
  }));

  // Темп старения: базовый 0.6 ед/год, ускоряется биологическим возрастом.
  const agingRate = clamp(0.6 + Math.max(0, profile.signals.bioAgeAccel) * 0.08, 0.4, 2.2);

  // Оптимизированный сценарий: модифицируемая часть ущерба снимается → выше старт
  // и медленнее старение.
  const optimizedStart = {} as Record<OrganSystem, number>;
  for (const sys of systems) optimizedStart[sys] = clamp(startState[sys] + (100 - startState[sys]) * 0.45, 5, 100);
  const optimizedAging = clamp(agingRate * 0.6, 0.3, 1.5);

  return {
    current,
    overallNow: overall(startState),
    baselineTrajectory: project(startState, agingRate, 10),
    optimizedTrajectory: project(optimizedStart, optimizedAging, 10),
  };
}
