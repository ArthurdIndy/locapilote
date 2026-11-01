import { describe, expect, it } from 'vitest';
import { loadTestDataset } from '../../db/testDataset';
import expected from '../../../data/expected.json';
import { expectedSynthesisLine } from '../../test/expected';
import { centsToEuros } from '../money';
import type { Asset, Dataset } from '../types';
import {
  assetDepreciation,
  depreciationEndDate,
  lmnpReelSummary,
  reconcile,
  type LmnpReelYear,
} from './lmnp-reel';

const dataset = loadTestDataset();
const property = dataset.properties[0]!;
const dataAsOf = dataset.assumptions[0]!.dataAsOf;
const years = lmnpReelSummary(dataset, property, dataAsOf);

const group = (pick: 'incomeByGroup' | 'expensesByGroup', name: string) => (y: LmnpReelYear) =>
  y[pick].find((g) => g.group === name)?.amount ?? null;

/** Ligne de expected.json → montant calculé (centimes). */
const LINES: [string, (y: LmnpReelYear) => number | null][] = [
  ['Loyers hors charges', group('incomeByGroup', 'Loyers')],
  ['Charges refacturées au locataire', group('incomeByGroup', 'Charges refacturées')],
  ['Autres recettes', group('incomeByGroup', 'Autres recettes')],
  ['Total des recettes imposables', (y) => y.taxableIncome],
  ['Frais de gestion (agence, comptable)', group('expensesByGroup', 'Frais de gestion')],
  ['Copropriété', group('expensesByGroup', 'Copropriété')],
  ['Assurances', group('expensesByGroup', 'Assurances')],
  ['Impôts et taxes', group('expensesByGroup', 'Impôts et taxes')],
  ['Entretien et petit équipement', group('expensesByGroup', 'Entretien et petit équipement')],
  ['Autres charges', group('expensesByGroup', 'Autres charges')],
  ["Intérêts d'emprunt (période louée)", (y) => y.loanInterest],
  ['Assurance emprunteur (période louée)', (y) => y.loanInsurance],
  ['Total des charges déductibles', (y) => y.deductibleExpenses],
  ['Résultat avant amortissements', (y) => y.resultBeforeDepreciation],
  ["Dotations aux amortissements de l'année", (y) => y.depreciation],
  ["Amortissements en report (début d'année)", (y) => y.carryforwardStart],
  ['Amortissements utilisés', (y) => y.depreciationUsed],
  ["Amortissements en report (fin d'année, calcul de l'outil)", (y) => y.carryforwardEnd],
  ['Résultat fiscal estimé', (y) => y.taxResult],
  ['Dépenses à qualifier (non retenues)', (y) => y.toReview],
  ["Investissements de l'année (à amortir)", (y) => y.investments],
  ['Stock reporté retenu par le comptable (comptes déposés)', (y) => y.accountantCarryforward],
];

describe('récapitulatif LMNP réel du jeu de test', () => {
  it('couvre 2024 à 2026', () => {
    expect(years.map((y) => y.year)).toEqual([2024, 2025, 2026]);
  });

  describe.each(LINES)('%s', (label, compute) => {
    const line = expectedSynthesisLine(label);
    it.each([0, 1, 2])('année %#, retrouve expected.json à 0,01 € près', (index) => {
      const y = years[index]!;
      const target = line[String(y.year)];
      const value = compute(y);
      if (target === null) {
        expect(value).toBeNull();
        return;
      }
      expect(value).not.toBeNull();
      expect(Math.abs(centsToEuros(value!) - target!)).toBeLessThanOrEqual(0.01 + 1e-9);
    });
  });

  it('le stock du comptable fait foi pour le report de l’année suivante', () => {
    const [y2024, y2025, y2026] = years;
    expect(y2024!.carryforwardStartFromAccountant).toBe(false);
    expect(y2025!.carryforwardStart).toBe(183469);
    expect(y2025!.carryforwardStartFromAccountant).toBe(true);
    expect(y2026!.carryforwardStart).toBe(382430);
    // Sans stock du comptable, on enchaîne sur le report calculé par l'outil.
    const without = lmnpReelSummary(
      { ...dataset, accountantCarryforwards: [] },
      property,
      dataAsOf,
    );
    expect(without[1]!.carryforwardStart).toBe(without[0]!.carryforwardEnd);
    expect(without[2]!.carryforwardStart).toBe(without[1]!.carryforwardEnd);
  });

  it('compte une ligne « À valider » en 2024 (contrôle « Lignes À qualifier »)', () => {
    const control = expected.controles.find((c) => c.controle === 'Lignes « À qualifier »')!;
    expect(years[0]!.toReviewCount).toBe(control.calcule);
    expect(years[1]!.toReviewCount).toBe(0);
  });

  it('intérêts et assurance 2025 : contrôle « Intérêts et assurance emprunteur 2025 »', () => {
    const control = expected.controles.find((c) => c.controle.startsWith('Intérêts et assurance'))!;
    const y = years[1]!;
    expect(centsToEuros(y.loanInterest + y.loanInsurance)).toBeCloseTo(control.calcule, 2);
  });
});

describe('un amortissement ne crée pas de déficit', () => {
  const noIncome: Dataset = {
    ...dataset,
    transactions: dataset.transactions.filter((t) => {
      const c = dataset.categories.find((k) => k.id === t.categoryId);
      return c?.direction !== 'income';
    }),
    accountantCarryforwards: [],
  };
  const deficit = lmnpReelSummary(noIncome, property, dataAsOf);

  it('résultat avant amortissements négatif : déficit, aucun amortissement utilisé', () => {
    for (const y of deficit) {
      expect(y.resultBeforeDepreciation).toBeLessThan(0);
      expect(y.depreciationUsed).toBe(0);
      expect(y.taxResult).toBe(y.resultBeforeDepreciation);
    }
  });

  it('la dotation part entièrement en report, sans limite de durée', () => {
    expect(deficit[0]!.carryforwardEnd).toBe(deficit[0]!.depreciation);
    expect(deficit[2]!.carryforwardEnd).toBe(
      deficit[0]!.depreciation + deficit[1]!.depreciation + deficit[2]!.depreciation,
    );
  });
});

describe('dotation au prorata des jours (base 365)', () => {
  const asset = (over: Partial<Asset>): Asset => ({
    id: 'a',
    propertyId: 'P',
    component: 'Test',
    inServiceDate: '2024-06-11',
    value: 107601,
    durationYears: 5,
    ...over,
  });

  it('réfrigérateur 2024 : 204 jours sur 365 (comptes 2024 : 120,28 €)', () => {
    expect(assetDepreciation(asset({}), 2024)).toBeCloseTo((204 * 21520.2) / 365, 6);
    expect(Math.round(assetDepreciation(asset({}), 2024))).toBe(12028);
  });

  it('année pleine : la dotation annuelle, même en année bissextile', () => {
    expect(assetDepreciation(asset({}), 2025)).toBeCloseTo(21520.2, 6);
    expect(assetDepreciation(asset({ inServiceDate: '2023-01-01' }), 2024)).toBeCloseTo(21520.2, 6);
  });

  it('fin = mise en service + durée en mois arrondis − 1 jour', () => {
    expect(depreciationEndDate(asset({}))).toBe('2029-06-10');
    expect(
      depreciationEndDate(asset({ inServiceDate: '2024-05-18', durationYears: 22.388075 })),
    ).toBe('2046-10-17');
    // Dernière année : du 1er janvier au 10 juin 2029 (161 jours).
    expect(assetDepreciation(asset({}), 2029)).toBeCloseTo((161 * 21520.2) / 365, 6);
    expect(assetDepreciation(asset({}), 2030)).toBe(0);
  });

  it('durée 0 = non amorti', () => {
    expect(assetDepreciation(asset({ durationYears: 0 }), 2025)).toBe(0);
    expect(depreciationEndDate(asset({ durationYears: 0 }))).toBeNull();
  });

  it('avant la mise en service : rien', () => {
    expect(assetDepreciation(asset({}), 2023)).toBe(0);
  });
});

describe('rapprochement avec le comptable (contrôles « Écart expliqué »)', () => {
  const controls = expected.controles.filter((c) => c.statut === 'Écart expliqué');
  const lineOf = (label: string) => (label.startsWith('Recettes') ? 'income' : 'expenses');

  it.each(controls.map((c) => [c.controle, c] as const))('%s', (_, control) => {
    const yearNumber = Number(control.controle.slice(-4));
    const y = years.find((k) => k.year === yearNumber)!;
    const filing = dataset.accountantFilings.find((f) => f.year === yearNumber);
    const line = reconcile(y, filing).find((l) => l.line === lineOf(control.controle))!;
    expect(centsToEuros(line.tool)).toBeCloseTo(control.calcule, 2);
    expect(centsToEuros(line.accountant!)).toBeCloseTo(control.attendu, 2);
    expect(centsToEuros(line.gap!)).toBeCloseTo(control.calcule - control.attendu, 2);
    expect(line.status).toBe('explained');
  });

  it('dotations 2024 et 2025 : identiques aux comptes déposés', () => {
    for (const yearNumber of [2024, 2025]) {
      const y = years.find((k) => k.year === yearNumber)!;
      const filing = dataset.accountantFilings.find((f) => f.year === yearNumber);
      const control = expected.controles.find(
        (c) => c.controle === `Dotations aux amortissements ${yearNumber} (modèle)`,
      )!;
      const line = reconcile(y, filing).find((l) => l.line === 'depreciation')!;
      expect(centsToEuros(line.accountant!)).toBe(control.attendu);
      expect(line.status).toBe('ok');
    }
  });

  it('un écart sans commentaire est « à expliquer » ; sans saisie, rien à comparer', () => {
    const y = years[0]!;
    const lines = reconcile(y, {
      propertyId: property.id,
      year: 2024,
      amounts: { income: 800000 },
      comments: {},
    });
    expect(lines.find((l) => l.line === 'income')!.status).toBe('to-explain');
    expect(lines.find((l) => l.line === 'result')!.status).toBe('not-entered');
    expect(reconcile(years[2]!, undefined).every((l) => l.status === 'not-entered')).toBe(true);
  });
});

describe('ordre des groupes', () => {
  it('loyers d’abord, « Autres… » en dernier, le reste par ordre alphabétique', () => {
    expect(years[0]!.incomeByGroup.map((g) => g.group)).toEqual([
      'Loyers',
      'Charges refacturées',
      'Autres recettes',
    ]);
    expect(years[0]!.expensesByGroup.map((g) => g.group)).toEqual([
      'Assurances',
      'Copropriété',
      'Entretien et petit équipement',
      'Frais de gestion',
      'Impôts et taxes',
      'Autres charges',
    ]);
  });
});
