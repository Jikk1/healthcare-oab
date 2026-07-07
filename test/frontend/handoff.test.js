import { describe, it, expect, beforeEach } from 'vitest';
import { stashProfile, takeProfile } from '../../lib/handoff.js';

describe('handoff (labs → predict профиль)', () => {
  beforeEach(() => sessionStorage.clear());

  it('takeProfile возвращает null, когда ничего не передано', () => {
    expect(takeProfile()).toBeNull();
  });

  it('round-trip: сохранённый профиль забирается целиком', () => {
    const profile = {
      ageYears: 58, sex: 'FEMALE',
      labs: { hemoglobin: 118, platelets: 210, systolicBp: 148, ldl: 4.1 },
      lifestyle: { smokingStatus: 'FORMER', packYears: 12 },
    };
    stashProfile(profile); // без targetUrl — не навигируем в тесте
    expect(takeProfile()).toEqual(profile);
  });

  it('одноразовость: второй takeProfile уже пуст (обновление страницы не залипает)', () => {
    stashProfile({ ageYears: 40 });
    expect(takeProfile()).toEqual({ ageYears: 40 });
    expect(takeProfile()).toBeNull();
  });

  it('битый payload не роняет вызов', () => {
    sessionStorage.setItem('hc:handoff:profile', '{ не json');
    expect(takeProfile()).toBeNull();
  });
});
