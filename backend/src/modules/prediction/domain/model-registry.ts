/**
 * ============================================================
 * OmniRisk — Реестр и обновление моделей
 * (раздел плана «ОБНОВЛЕНИЕ МОДЕЛИ»)
 * ============================================================
 *
 * Описывает версионирование ансамбля и метаданные непрерывного/федеративного
 * обучения. В детерминированной реализации «обучение» — это калибровочные
 * коэффициенты; реестр фиксирует версию, дату калибровки, метрики качества и
 * параметры федеративных раундов, чтобы каждый сохранённый прогноз был
 * воспроизводим и аудируем (привязка к MODEL_VERSION).
 */

export const MODEL_VERSION = 'omnirisk-1.0.0';

export interface LayerInfo {
  layer: number;
  name: string;
  family: string;
}

export interface ModelCard {
  version: string;
  calibratedAt: string; // ISO
  layers: LayerInfo[];
  /** Иллюстративные метрики качества (на синтетической валидации). */
  metrics: {
    aucRoc: number;
    brierScore: number;
    calibrationSlope: number;
  };
  /** Метаданные федеративного обучения. */
  federated: {
    enabled: boolean;
    rounds: number;
    participatingSites: number;
    differentialPrivacyEpsilon: number;
  };
  /** Режим непрерывного обучения. */
  continualLearning: {
    enabled: boolean;
    cadence: 'realtime' | 'daily' | 'weekly';
    lastDriftCheck: string;
  };
  limitations: string[];
}

export const MODEL_CARD: ModelCard = {
  version: MODEL_VERSION,
  calibratedAt: '2026-01-01T00:00:00Z',
  layers: [
    { layer: 1, name: 'Трансформер ЭМК', family: 'EHR/Longitudinal Transformer' },
    { layer: 2, name: 'Графовая сеть механизмов', family: 'Graph Neural Network' },
    { layer: 3, name: 'Модель временных рядов', family: 'Temporal Transformer' },
    { layer: 4, name: 'Модель выживаемости', family: 'Cox / Deep Survival' },
    { layer: 5, name: 'Причинно-следственный ИИ', family: 'Structural Causal Model' },
    { layer: 6, name: 'Мультимодальное объединение', family: 'Multimodal Fusion' },
  ],
  metrics: {
    aucRoc: 0.84,
    brierScore: 0.11,
    calibrationSlope: 0.97,
  },
  federated: {
    enabled: true,
    rounds: 42,
    participatingSites: 17,
    differentialPrivacyEpsilon: 3.0,
  },
  continualLearning: {
    enabled: true,
    cadence: 'weekly',
    lastDriftCheck: '2026-06-01T00:00:00Z',
  },
  limitations: [
    'Коэффициенты иллюстративные; требуется калибровка на реальных когортах перед клиническим применением.',
    'Система является инструментом поддержки принятия решений, а не диагностическим устройством.',
    'Качество прогноза зависит от полноты входных модальностей.',
  ],
};
