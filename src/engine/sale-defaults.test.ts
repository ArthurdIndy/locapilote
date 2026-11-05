import { describe, expect, it } from 'vitest';
import { loadTestDataset } from '../db/testDataset';
import { defaultAssumptions } from '../db/defaultAssumptions';
import {
  accountantFees,
  isExcludedFromProjection,
  journalLastTwelveMonths,
  resolveSaleAssumptions,
} from './sale-defaults';

const dataset = loadTestDataset();
const property = dataset.properties[0]!;
const saved = dataset.assumptions[0]!;
const dataAsOf = saved.dataAsOf; // 2026-10-25
const automatic = defaultAssumptions(property.id, dataAsOf);

describe('valeurs de la simulation de vente calculées automatiquement', () => {
  const r = resolveSaleAssumptions(dataset, property, automatic, dataAsOf);

  it('loyer net et dépenses : d’après le budget 2026 (US12)', () => {
    expect(r.projectionSource).toEqual({ kind: 'budget', years: [2026] });
    // (loyers et charges 13 908,70 − gestion et comptable 1 575,52) / 12.
    expect(r.netRentMonthly.value).toBeCloseTo((1390870 - 157552) / 12, 6);
    // Copropriété 2 463,17 + impôts et taxes 570,15 + assurances et entretien 508,11.
    expect(r.annualExpensesExcludingLoan.value).toBe(354143);
    expect(r.netRentMonthly.modified).toBe(false);
  });

  it('sans budget : 12 derniers mois du journal (26/10/2025 au 25/10/2026)', () => {
    expect(r.journalWindow).toEqual({ from: '2025-10-26', to: '2026-10-25' });
    const journal = journalLastTwelveMonths(dataset, property, dataAsOf)!;
    expect(journal.income).toBe(1392070); // 13 920,70 € de recettes
    expect(journal.expenses).toBe(778255); // 7 782,55 € : hors immobilisations et travaux (29,96 €)
    // Bien loué depuis le 01/01/2026 : pas de budget 2026 (pas d'année précédente).
    const recent = { ...property, rentalStartDate: '2026-01-01' };
    const j = resolveSaleAssumptions(
      { ...dataset, properties: [recent] },
      recent,
      automatic,
      dataAsOf,
    );
    expect(j.projectionSource).toEqual({ kind: 'journal' });
    const window = journalLastTwelveMonths(dataset, recent, dataAsOf)!;
    expect(j.netRentMonthly.value).toBeCloseTo(window.income / 12, 6);
    expect(j.annualExpensesExcludingLoan.value).toBeCloseTo(window.expenses, 6);
  });

  it('projection : dépenses immobilisées et catégories de travaux exclues, rien d’autre', () => {
    const byName = (name: string) => dataset.categories.find((c) => c.name === name)!;
    expect(isExcludedFromProjection(byName("Travaux d'amélioration (à amortir)"), property)).toBe(
      true,
    );
    expect(isExcludedFromProjection(byName('Équipement / mobilier (à amortir)'), property)).toBe(
      true,
    );
    expect(isExcludedFromProjection(byName('Honoraires sur travaux'), property)).toBe(true);
    expect(
      isExcludedFromProjection(
        { ...byName('Charges de copropriété'), name: 'Travaux de copropriété' },
        property,
      ),
    ).toBe(true);
    expect(isExcludedFromProjection(byName('À qualifier'), property)).toBe(false);
    expect(isExcludedFromProjection(byName('Charges de copropriété'), property)).toBe(false);
    expect(isExcludedFromProjection(byName('Entretien et réparations'), property)).toBe(false);
  });

  it('évolution annuelle 1,5 %', () => {
    expect(r.annualGrowth.value).toBe(0.015);
  });

  it('amortissements des années futures : ceux de la dernière année complète (2025)', () => {
    // 2025 : dotation 9 297,34 + report 1 834,69 − stock du comptable 3 824,30.
    expect(r.lastCompleteYear).toBe(2025);
    expect(r.depreciationDeductedPerYear.value).toBe(730773);
  });

  it('frais de l’année de la vente : honoraires du comptable de 2025', () => {
    expect(accountantFees(dataset, property, 2025)).toBe(55800);
    expect(r.saleYearCosts.value).toBe(55800);
  });

  it('un bien loué depuis moins de 12 mois : montants annualisés', () => {
    const recent = { ...property, rentalStartDate: '2026-04-27' }; // 182 jours
    const journal = journalLastTwelveMonths(dataset, recent, dataAsOf)!;
    expect(journal.from).toBe('2026-04-27');
    const raw = journalLastTwelveMonths(dataset, property, dataAsOf);
    expect(journal.income).toBeLessThan(raw!.income * 1.2);
    expect(journal.income).toBeGreaterThan(0);
  });

  it('les valeurs du jeu de test sont gardées comme valeurs modifiées', () => {
    const s = resolveSaleAssumptions(dataset, property, saved, dataAsOf);
    expect(s.netRentMonthly).toMatchObject({ value: 105661, modified: true });
    expect(s.annualExpensesExcludingLoan).toMatchObject({ value: 559860, modified: true });
    expect(s.annualGrowth).toMatchObject({ value: 0.015, modified: true });
    expect(s.depreciationDeductedPerYear).toMatchObject({
      value: 418500,
      modified: true,
      automatic: 730773,
    });
    expect(s.saleYearCosts).toMatchObject({ value: 55800, modified: true });
  });

  it('sans mise en location : pas de projection', () => {
    const r2 = resolveSaleAssumptions(
      dataset,
      { ...property, rentalStartDate: null },
      automatic,
      dataAsOf,
    );
    expect(r2.journalWindow).toBeNull();
    expect(r2.netRentMonthly.value).toBe(0);
  });
});
