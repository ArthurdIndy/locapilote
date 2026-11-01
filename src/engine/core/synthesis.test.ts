import { describe, expect, it } from 'vitest';
import { loadTestDataset } from '../../db/testDataset';
import { expectedSynthesisLine } from '../../test/expected';
import { centsToEuros } from '../money';
import { propertySynthesis, rentalMonths, synthesisYears, type YearSynthesis } from './synthesis';

const dataset = loadTestDataset();
const property = dataset.properties[0]!;
const dataAsOf = dataset.assumptions[0]!.dataAsOf;
const years = propertySynthesis(dataset, property, dataAsOf);

/** Ligne de expected.json → valeur calculée (montants en euros, taux et mois tels quels). */
const euros = (pick: (y: YearSynthesis) => number | null) => (y: YearSynthesis) => {
  const v = pick(y);
  return v === null ? null : centsToEuros(v);
};
const raw = (pick: (y: YearSynthesis) => number | null) => pick;

const LINES: [string, (y: YearSynthesis) => number | null, number][] = [
  ['Loyers hors charges', euros((y) => y.rent), 2],
  ['Encaissements (recettes)', euros((y) => y.income), 2],
  ['Dépenses payées (hors prêt)', euros((y) => y.expenses), 2],
  ['Échéances de prêt (période louée)', euros((y) => y.loanPayments), 2],
  ['dont capital remboursé', euros((y) => y.principalRepaid), 2],
  ["Intérêts d'emprunt (période louée)", euros((y) => y.loanInterest), 2],
  ['Assurance emprunteur (période louée)', euros((y) => y.loanInsurance), 2],
  ['Cash-flow', euros((y) => y.cashFlow), 2],
  ['Mois de location sur la période', raw((y) => y.rentalMonths), 4],
  ['Cash-flow mensuel moyen', euros((y) => y.monthlyCashFlow), 2],
  ['Enrichissement (cash-flow + capital remboursé)', euros((y) => y.wealthGain), 2],
  ['Loyers hors charges annualisés', euros((y) => y.annualizedRent), 2],
  ['Rendement brut', raw((y) => y.grossYield), 4],
  ['Rendement net (avant financement)', raw((y) => y.netYield), 4],
  ['Capital restant dû au 31/12', euros((y) => y.outstandingAtYearEnd), 2],
  ['Valeur estimée moins capital restant dû', euros((y) => y.equity), 2],
];

describe('synthèse annuelle du jeu de test', () => {
  it('couvre 2024 à 2026 (mise en location en 2024, données au 25/10/2026)', () => {
    expect(years.map((y) => y.year)).toEqual([2024, 2025, 2026]);
  });

  describe.each(LINES)('%s', (label, compute, digits) => {
    const expected = expectedSynthesisLine(label);
    it.each([0, 1, 2])('année %#, retrouve expected.json', (index) => {
      const y = years[index]!;
      const value = compute(y);
      const target = expected[String(y.year)];
      expect(value).not.toBeNull();
      // toBeCloseTo(x, 2) : écart < 0,005 € ; toBeCloseTo(x, 4) : écart < 0,00005.
      expect(Math.abs(value! - target!)).toBeLessThanOrEqual(digits === 2 ? 0.01 : 0.0001);
    });
  });

  it('les charges hors prêt du rendement net = charges déductibles hors intérêts et assurance', () => {
    const deductible = expectedSynthesisLine('Total des charges déductibles');
    const interest = expectedSynthesisLine("Intérêts d'emprunt (période louée)");
    const insurance = expectedSynthesisLine('Assurance emprunteur (période louée)');
    for (const y of years) {
      const k = String(y.year);
      expect(centsToEuros(y.operatingExpenses)).toBeCloseTo(
        deductible[k]! - interest[k]! - insurance[k]!,
        2,
      );
    }
  });
});

describe('mois de location', () => {
  it('compte les jours bornes incluses, en base 365/12', () => {
    expect(rentalMonths(2024, '2024-05-18', '2026-10-25')).toBeCloseTo((228 * 12) / 365, 10);
    expect(rentalMonths(2025, '2024-05-18', '2026-10-25')).toBe(12);
  });

  it("s'arrête à la fin du mois de la date de mise à jour", () => {
    expect(rentalMonths(2026, '2024-05-18', '2026-10-25')).toBeCloseTo((304 * 12) / 365, 10);
  });

  it('vaut 0 sans mise en location ou après la date de mise à jour', () => {
    expect(rentalMonths(2024, null, '2026-10-25')).toBe(0);
    expect(rentalMonths(2027, '2024-05-18', '2026-10-25')).toBe(0);
  });
});

describe('date de mise à jour des données', () => {
  it("n'affiche pas les années suivantes", () => {
    expect(synthesisYears(property, '2025-03-01')).toEqual([2024, 2025]);
    expect(synthesisYears(property, '2024-01-01')).toEqual([]);
  });

  it("ne compte les échéances que jusqu'à cette date", () => {
    const [y2026] = propertySynthesis(dataset, property, '2026-03-10').slice(-1);
    // Échéances du 5 janvier au 5 mars 2026 : 3 échéances.
    const installments = dataset.loanInstallments.filter(
      (i) => i.date >= '2026-01-01' && i.date <= '2026-03-10',
    );
    expect(installments).toHaveLength(3);
    expect(y2026!.loanPayments).toBe(
      installments.reduce((s, i) => s + i.principal + i.interest + i.insurance, 0),
    );
  });

  it('sans prêt ni mouvement, tout vaut 0 et le capital restant dû aussi', () => {
    const empty = { ...dataset, transactions: [], loans: [], loanInstallments: [] };
    const [y] = propertySynthesis(empty, property, dataAsOf);
    expect(y!.cashFlow).toBe(0);
    expect(y!.outstandingAtYearEnd).toBe(0);
    expect(y!.equity).toBe(property.estimatedValue);
  });
});
