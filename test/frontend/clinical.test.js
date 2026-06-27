import { describe, it, expect } from 'vitest';
import { resolveRange, fieldStatus, mapBiomarkers, BIOMARKER_MAP } from '../../lib/clinical.js';

describe('resolveRange', () => {
  it('возвращает массив-диапазон как есть', () => {
    expect(resolveRange([1, 2], 'MALE')).toEqual([1, 2]);
  });
  it('выбирает диапазон по полу', () => {
    const ref = { MALE: [130, 170], FEMALE: [120, 150], OTHER: [120, 170] };
    expect(resolveRange(ref, 'FEMALE')).toEqual([120, 150]);
    expect(resolveRange(ref, 'MALE')).toEqual([130, 170]);
  });
  it('падает на OTHER при неизвестном поле', () => {
    const ref = { MALE: [1, 2], FEMALE: [3, 4], OTHER: [5, 6] };
    expect(resolveRange(ref, 'UNKNOWN')).toEqual([5, 6]);
  });
});

describe('fieldStatus', () => {
  it('null для незаданного значения', () => {
    expect(fieldStatus([120, 150], undefined)).toBeNull();
    expect(fieldStatus([120, 150], null)).toBeNull();
    expect(fieldStatus([120, 150], NaN)).toBeNull();
  });
  it('ok внутри диапазона', () => {
    expect(fieldStatus([120, 150], 130)).toBe('ok');
    expect(fieldStatus([120, 150], 120)).toBe('ok');
    expect(fieldStatus([120, 150], 150)).toBe('ok');
  });
  it('warn для умеренного отклонения (≤40% ширины)', () => {
    // ширина 30, порог bad = 12; отклонение 2 → warn
    expect(fieldStatus([120, 150], 118)).toBe('warn');
  });
  it('bad для сильного отклонения (>40% ширины)', () => {
    // Hb 95 при норме 120–150: отклонение 25 > 12 → bad
    expect(fieldStatus([120, 150], 95)).toBe('bad');
    // СОЭ 30 при норме 0–15: отклонение 15 > 6 → bad
    expect(fieldStatus([0, 15], 30)).toBe('bad');
  });
  it('точечная норма [0,0]: любое положительное → bad, ноль → ok', () => {
    expect(fieldStatus([0, 0], 5)).toBe('bad');
    expect(fieldStatus([0, 0], 0)).toBe('ok');
  });
});

describe('mapBiomarkers', () => {
  it('маппит, округляет целочисленные, считает count', () => {
    const { body, count } = mapBiomarkers(
      { systolicBp: 150.6, diastolicBp: 95.2, ldl: 4.2, activityPerWeek: 2.4 },
      { smokingStatus: 'CURRENT', familyCv: 1 },
    );
    expect(body).toEqual({
      smokingStatus: 'CURRENT',
      systolicBp: 151, // округлено до int
      diastolicBp: 95,
      ldl: 4.2, // не int — без округления
      activityPerWeek: 2, // округлено
      familyHistoryCvd: true,
    });
    expect(count).toBe(4);
    expect('onStatins' in body).toBe(false); // не собираем — у сервера есть дефолт
  });

  it('пустой ввод → только smokingStatus по умолчанию, count 0', () => {
    const { body, count } = mapBiomarkers({});
    expect(body).toEqual({ smokingStatus: 'NEVER' });
    expect(count).toBe(0);
    expect('familyHistoryCvd' in body).toBe(false);
  });

  it('familyCv=0 → familyHistoryCvd:false', () => {
    const { body } = mapBiomarkers({}, { familyCv: 0 });
    expect(body.familyHistoryCvd).toBe(false);
  });

  it('пропускает undefined/NaN значения', () => {
    const { body, count } = mapBiomarkers({ ldl: undefined, hba1c: NaN, bmi: 27 });
    expect(body).toEqual({ smokingStatus: 'NEVER', bmi: 27 });
    expect(count).toBe(1);
  });

  it('BIOMARKER_MAP покрывает ожидаемые поля', () => {
    expect(Object.keys(BIOMARKER_MAP)).toEqual(
      expect.arrayContaining(['systolicBp', 'ldl', 'hba1c', 'bmi', 'egfr', 'packYears', 'activityPerWeek']),
    );
  });
});
