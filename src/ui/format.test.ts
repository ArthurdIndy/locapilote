import { describe, expect, it } from 'vitest';
import { formatDate, formatEuros, todayIso } from './format';

describe('formatage', () => {
  it('affiche les euros à la française', () => {
    expect(formatEuros(10057100).replace(/\s/g, ' ')).toBe('100 571,00 €');
  });

  it('affiche les dates en JJ/MM/AAAA', () => {
    expect(formatDate('2024-05-18')).toBe('18/05/2024');
  });

  it('donne la date du jour locale au format ISO', () => {
    expect(todayIso(new Date(2026, 9, 31, 23, 59))).toBe('2026-10-31');
  });
});
