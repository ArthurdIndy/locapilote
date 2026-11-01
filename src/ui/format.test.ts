import { describe, expect, it } from 'vitest';
import {
  centsToInput,
  formatDate,
  formatEuros,
  formatPercent,
  isPlausibleDate,
  normalizeForSearch,
  parseEurosInput,
  parsePercentInput,
  parseYearsInput,
  rateToInput,
  todayIso,
} from './format';

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

  it('lit un montant saisi en euros', () => {
    expect(parseEurosInput('1 054,89')).toBe(105489);
    expect(parseEurosInput('1054.89')).toBe(105489);
    expect(parseEurosInput('12')).toBe(1200);
    expect(parseEurosInput('12,5 €')).toBe(1250);
    expect(parseEurosInput('-107,46')).toBe(-10746);
    expect(parseEurosInput('0,1')).toBe(10);
    expect(parseEurosInput('')).toBeNull();
    expect(parseEurosInput('12,345')).toBeNull();
    expect(parseEurosInput('abc')).toBeNull();
  });

  it('prépare un montant pour un champ de saisie', () => {
    expect(centsToInput(105489)).toBe('1054,89');
    expect(centsToInput(1200)).toBe('12');
    expect(centsToInput(-10746)).toBe('-107,46');
    expect(centsToInput(5)).toBe('0,05');
    for (const cents of [0, 1, 99, 105489, -10746]) {
      expect(parseEurosInput(centsToInput(cents))).toBe(cents);
    }
  });

  it('cherche sans tenir compte des accents', () => {
    expect(normalizeForSearch('Équipement')).toBe('equipement');
  });

  it('lit et affiche les taux en pourcentage', () => {
    expect(parsePercentInput('1,5')).toBe(0.015);
    expect(parsePercentInput('1.45 %')).toBe(0.0145);
    expect(parsePercentInput('abc')).toBeNull();
    expect(parsePercentInput('-1')).toBeNull();
    expect(rateToInput(0.015)).toBe('1,5');
    expect(formatPercent(0.045922).replace(/\s/g, ' ')).toBe('4,59 %');
  });
});

describe('parseYearsInput', () => {
  it('lit une durée en années, entière ou décimale', () => {
    expect(parseYearsInput('5')).toBe(5);
    expect(parseYearsInput('22,388075')).toBe(22.388075);
    expect(parseYearsInput('0')).toBe(0);
  });

  it('refuse une saisie invalide', () => {
    expect(parseYearsInput('')).toBeNull();
    expect(parseYearsInput('-1')).toBeNull();
    expect(parseYearsInput('cinq')).toBeNull();
  });
});

describe('isPlausibleDate', () => {
  it('accepte une date complète entre 2000 et 2100', () => {
    expect(isPlausibleDate('2026-10-25')).toBe(true);
    expect(isPlausibleDate('2000-01-01')).toBe(true);
    expect(isPlausibleDate('2100-12-31')).toBe(true);
    expect(isPlausibleDate('2024-02-29')).toBe(true);
  });

  it('écarte une saisie en cours, hors plage ou impossible', () => {
    expect(isPlausibleDate('0002-11-11')).toBe(false);
    expect(isPlausibleDate('0202-11-11')).toBe(false);
    expect(isPlausibleDate('1999-12-31')).toBe(false);
    expect(isPlausibleDate('2101-01-01')).toBe(false);
    expect(isPlausibleDate('2025-02-29')).toBe(false);
    expect(isPlausibleDate('')).toBe(false);
  });
});
