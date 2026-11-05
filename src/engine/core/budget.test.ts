import { describe, expect, it } from 'vitest';
import { defaultCategories } from '../../db/defaultCategories';
import { defaultAssumptions } from '../../db/defaultAssumptions';
import { loadTestDataset } from '../../db/testDataset';
import { resolveSaleAssumptions } from '../sale-defaults';
import type { Budget, Dataset, IsoDate, Property, Transaction } from '../types';
import {
  budgetLineOf,
  budgetProjection,
  budgetYears,
  hasBudget,
  yearBudget,
  type BudgetRowId,
  type YearBudget,
} from './budget';

/**
 * Petits jeux de données calculés à la main. Catégories : celles proposées par défaut
 * (identifiant = nom). Montants en centimes.
 */
const PROPERTY: Property = {
  ...loadTestDataset().properties[0]!,
  id: 'B',
  rentalStartDate: '2024-01-01',
};

let n = 0;
function tx(date: IsoDate, categoryId: string, amount: number): Transaction {
  n += 1;
  return {
    id: `t${n}`,
    propertyId: 'B',
    date,
    account: 'Banque',
    categoryId,
    label: '',
    amount,
    document: null,
    source: null,
    comment: null,
  };
}

function dataset(
  transactions: Transaction[],
  options: { property?: Partial<Property>; budgets?: Budget[]; loan?: boolean } = {},
): Dataset {
  const loan = options.loan ?? false;
  return {
    properties: [{ ...PROPERTY, ...options.property }],
    categories: defaultCategories(),
    transactions,
    loans: loan
      ? [
          {
            id: 'L',
            propertyId: 'B',
            bank: 'Banque',
            label: 'Prêt',
            principal: 1_000_000,
            annualRate: 0.01,
            durationMonths: 36,
            firstInstallmentDate: '2025-01-05',
            lastInstallmentDate: '2027-12-05',
            monthlyInsurance: 500,
          },
        ]
      : [],
    // Une échéance de 300 € (dont 5 € d'assurance) le 5 de chaque mois, de 2025 à 2027.
    loanInstallments: loan
      ? Array.from({ length: 36 }, (_, i) => ({
          loanId: 'L',
          number: i + 1,
          date: `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-05`,
          principalBefore: 0,
          principal: 27_000,
          interest: 2_500,
          insurance: 500,
        }))
      : [],
    assets: [],
    accountantCarryforwards: [],
    accountantFilings: [],
    preRentalExpenses: [],
    assumptions: [],
    householdSettings: [],
    budgets: options.budgets ?? [],
  };
}

const GROWTH = 0.015;

function row(budget: YearBudget, id: BudgetRowId) {
  return budget.rows.find((r) => r.id === id)!;
}

describe('rattachement des catégories aux lignes du budget', () => {
  it('chaque catégorie du jeu de test a sa ligne', () => {
    const lines = Object.fromEntries(
      defaultCategories().map((c) => [c.name, budgetLineOf(c, PROPERTY)]),
    );
    expect(lines).toEqual({
      'Loyer hors charges': 'income',
      'Provisions sur charges': 'income',
      'Régularisation de charges locataire': 'income',
      'Taxe ordures ménagères refacturée': 'income',
      'Autres recettes': 'income',
      'Honoraires de gestion': 'management',
      'Honoraires de mise en location': 'management',
      'Honoraires sur travaux': 'other',
      'Honoraires comptable': 'management',
      'Charges de copropriété': 'coOwnership',
      'Assurance PNO': 'insuranceMaintenance',
      'Taxe foncière': 'taxes',
      CFE: 'taxes',
      'Entretien et réparations': 'insuranceMaintenance',
      'Petit équipement': 'insuranceMaintenance',
      'Frais bancaires': 'other',
      'Autres charges': 'other',
      'Équipement / mobilier (à amortir)': 'other',
      "Travaux d'amélioration (à amortir)": 'other',
      'À qualifier': 'other',
      'Transfert entrant': null,
      'Transfert sortant': null,
      'Dépôt de garantie reçu': null,
      'Dépôt de garantie restitué': null,
    });
  });
});

describe('budget de l’année en cours', () => {
  // 2025 : loyers 12 × 1 000 €, copropriété 4 × 500 € (trimestres), taxe foncière 1 000 € en
  // octobre, une dépense à amortir de 2 000 €. 2026, au 30/06 : loyers 6 × 1 050 €, copropriété
  // 2 × 520 €, rien d'autre.
  const transactions = [
    ...Array.from({ length: 12 }, (_, m) =>
      tx(`2025-${String(m + 1).padStart(2, '0')}-01`, 'Loyer hors charges', 100_000),
    ),
    ...['01', '04', '07', '10'].map((m) => tx(`2025-${m}-10`, 'Charges de copropriété', 50_000)),
    tx('2025-10-15', 'Taxe foncière', 100_000),
    tx('2025-03-01', 'Équipement / mobilier (à amortir)', 200_000),
    ...Array.from({ length: 6 }, (_, m) => tx(`2026-0${m + 1}-01`, 'Loyer hors charges', 105_000)),
    tx('2026-01-10', 'Charges de copropriété', 52_000),
    tx('2026-04-10', 'Charges de copropriété', 52_000),
    // Après la date des données : pas compté dans le payé à ce jour.
    tx('2026-07-01', 'Loyer hors charges', 105_000),
  ];
  const data = dataset(transactions, { loan: true });
  const b = yearBudget(data, data.properties[0]!, 2026, '2026-06-30', GROWTH);

  it('N−1 réel : opérations de l’année précédente', () => {
    expect(b.kind).toBe('current');
    expect(b.previousProrated).toBe(false);
    expect(row(b, 'income').previous).toBe(1_200_000);
    expect(row(b, 'coOwnership').previous).toBe(200_000);
    expect(row(b, 'taxes').previous).toBe(100_000);
    expect(row(b, 'other').previous).toBe(200_000);
    expect(row(b, 'loan').previous).toBe(360_000);
  });

  it('prévu par défaut : N−1 réel + 1,5 %, autres dépenses à 0, prêt d’après l’échéancier', () => {
    expect(row(b, 'income').planned).toBe(1_218_000);
    expect(row(b, 'coOwnership').planned).toBe(203_000);
    expect(row(b, 'taxes').planned).toBe(101_500);
    expect(row(b, 'management').planned).toBe(0);
    expect(row(b, 'other').planned).toBe(0);
    expect(row(b, 'loan').planned).toBe(360_000);
    expect(row(b, 'income').modified).toBe(false);
    // À sortir de ta poche = 2 030 + 1 015 + 3 600 − 12 180 = −5 535 € (le bien rapporte).
    expect(row(b, 'outOfPocket').planned).toBe(203_000 + 101_500 + 360_000 - 1_218_000);
  });

  it('estimé fin d’année : payé à ce jour + N−1 sur la période restante × prévu / N−1', () => {
    const income = row(b, 'income');
    expect(income.paidToDate).toBe(630_000);
    expect(income.previousToDate).toBe(600_000);
    // 6 300 + 6 000 × 12 180 / 12 000 = 12 390 €.
    expect(income.actual).toBe(1_239_000);
    expect(income.gap).toBe(21_000);
    // Copropriété : 1 040 + 1 000 × 2 030 / 2 000 = 2 055 €.
    expect(row(b, 'coOwnership').actual).toBe(205_500);
  });

  it('saisonnalité : la taxe foncière d’octobre reste à venir au 30/06', () => {
    const taxes = row(b, 'taxes');
    expect(taxes.paidToDate).toBe(0);
    expect(taxes.actual).toBe(101_500);
    expect(taxes.gap).toBe(0);
  });

  it('prêt : échéances réelles de l’échéancier ; autres dépenses : ce qui est payé', () => {
    expect(row(b, 'loan').paidToDate).toBe(180_000);
    expect(row(b, 'loan').actual).toBe(360_000);
    // Prévu à 0 : le reste prévu est nul même si N−1 avait une dépense sur la même période.
    expect(row(b, 'other').actual).toBe(0);
    const total = row(b, 'outOfPocket');
    expect(total.actual).toBe(205_500 + 101_500 + 360_000 - 1_239_000);
    expect(total.gap).toBe(total.actual! - total.planned);
  });

  it('valeur modifiée : elle remplace le prévu de l’année, le calcul automatique reste connu', () => {
    const modified = dataset(transactions, {
      loan: true,
      budgets: [{ propertyId: 'B', year: 2026, planned: { coOwnership: 240_000 } }],
    });
    const m = yearBudget(modified, modified.properties[0]!, 2026, '2026-06-30', GROWTH);
    const copro = row(m, 'coOwnership');
    expect(copro).toMatchObject({ planned: 240_000, automatic: 203_000, modified: true });
    // Reste prévu à la même saisonnalité : 1 040 + 1 000 × 2 400 / 2 000 = 2 240 €.
    expect(copro.actual).toBe(224_000);
    expect(copro.gap).toBe(-16_000);
    expect(row(m, 'outOfPocket').planned).toBe(240_000 + 101_500 + 360_000 - 1_218_000);
    // Un budget d'une autre année ne change rien.
    const other = dataset(transactions, {
      loan: true,
      budgets: [{ propertyId: 'B', year: 2027, planned: { coOwnership: 1 } }],
    });
    expect(
      row(yearBudget(other, other.properties[0]!, 2026, '2026-06-30', GROWTH), 'coOwnership')
        .planned,
    ).toBe(203_000);
  });

  it('ligne sans historique : reste prévu = prévu × part de l’année restante', () => {
    const modified = dataset(transactions, {
      budgets: [{ propertyId: 'B', year: 2026, planned: { management: 120_000 } }],
    });
    const m = yearBudget(modified, modified.properties[0]!, 2026, '2026-06-30', GROWTH);
    // 184 jours restants (01/07 au 31/12) sur 365 : 1 200 × 184 / 365 = 604,93 €.
    expect(row(m, 'management').actual).toBe(60_493);
  });
});

describe('budget d’une année terminée ou future', () => {
  const transactions = [
    tx('2024-06-01', 'Loyer hors charges', 1_000_000),
    tx('2025-06-01', 'Loyer hors charges', 1_100_000),
    tx('2025-11-15', 'Taxe foncière', 80_000),
    tx('2026-02-01', 'Loyer hors charges', 500_000),
  ];
  const data = dataset(transactions);
  const property = data.properties[0]!;

  it('année terminée : N réel = opérations de l’année, écart = réel − prévu', () => {
    const b = yearBudget(data, property, 2025, '2026-03-31', GROWTH);
    expect(b.kind).toBe('past');
    expect(row(b, 'income')).toMatchObject({
      previous: 1_000_000,
      planned: 1_015_000,
      actual: 1_100_000,
      gap: 85_000,
      paidToDate: null,
    });
    expect(row(b, 'taxes')).toMatchObject({ planned: 0, actual: 80_000, gap: 80_000 });
  });

  it('année future : N−1 estimé, N prévu = estimé + 1,5 %, ni réel ni écart', () => {
    const current = yearBudget(data, property, 2026, '2026-03-31', GROWTH);
    const b = yearBudget(data, property, 2027, '2026-03-31', GROWTH);
    expect(b.kind).toBe('future');
    // N−1 = 2026, estimé fin d'année : 5 000 € perçus + le loyer de juin 2025 × 11 165 / 11 000.
    expect(row(b, 'income').previous).toBe(row(current, 'income').actual);
    expect(row(b, 'income').planned).toBe(Math.round(row(current, 'income').actual! * 1.015));
    expect(row(b, 'taxes').previous).toBe(row(current, 'taxes').actual);
    expect(row(b, 'income').actual).toBeNull();
    expect(row(b, 'income').gap).toBeNull();
  });

  it('années proposées : de la mise en location à l’année suivant celle des données', () => {
    expect(budgetYears(property, '2026-03-31')).toEqual([2024, 2025, 2026, 2027]);
    expect(budgetYears({ ...property, rentalStartDate: null }, '2026-03-31')).toEqual([]);
  });
});

describe('première année de location incomplète', () => {
  it('N−1 ramené à 12 mois au prorata des jours loués', () => {
    // Loué depuis le 01/07/2025 : 184 jours, soit 184 / (365 / 12) mois ; 6 loyers de 1 000 €.
    const transactions = Array.from({ length: 6 }, (_, m) =>
      tx(`2025-${String(m + 7).padStart(2, '0')}-01`, 'Loyer hors charges', 100_000),
    );
    const data = dataset([...transactions, tx('2025-09-01', 'Taxe foncière', 46_000)], {
      property: { rentalStartDate: '2025-07-01' },
      loan: true,
    });
    const b = yearBudget(data, data.properties[0]!, 2026, '2026-06-30', GROWTH);
    expect(b.previousProrated).toBe(true);
    // 6 000 × 365 / 184 = 11 902,17 € ; 460 × 365 / 184 = 912,50 €.
    expect(row(b, 'income').previous).toBe(1_190_217);
    expect(row(b, 'taxes').previous).toBe(91_250);
    // Les échéances de prêt ne sont pas ramenées : elles couvrent déjà l'année.
    expect(row(b, 'loan').previous).toBe(360_000);
    expect(row(b, 'income').planned).toBe(Math.round(1_190_217 * 1.015));
  });

  it('année de la mise en location : pas de budget (pas de N−1), sauf ligne modifiée', () => {
    const data = dataset([], { property: { rentalStartDate: '2026-03-01' } });
    const property = data.properties[0]!;
    expect(hasBudget(data, property, 2026)).toBe(false);
    expect(hasBudget(data, property, 2027)).toBe(true);
    const withSaved = dataset([], {
      property: { rentalStartDate: '2026-03-01' },
      budgets: [{ propertyId: 'B', year: 2026, planned: { income: 900_000 } }],
    });
    expect(hasBudget(withSaved, withSaved.properties[0]!, 2026)).toBe(true);
  });
});

describe('budget du jeu de test au 25/10/2026', () => {
  const data = loadTestDataset();
  const property = data.properties[0]!;
  const b = yearBudget(data, property, 2026, '2026-10-25', GROWTH);
  const values = (id: BudgetRowId) => {
    const r = row(b, id);
    return [r.previous, r.planned, r.actual, r.gap].map((v) => v! / 100);
  };

  it('2025 réel, 2026 prévu, estimé fin d’année, écart', () => {
    expect(values('income')).toEqual([13703.15, 13908.7, 13959.28, 50.58]);
    expect(values('coOwnership')).toEqual([2426.77, 2463.17, 4085.48, 1622.31]);
    expect(values('management')).toEqual([1552.24, 1575.52, 1562.98, -12.54]);
    expect(values('taxes')).toEqual([561.72, 570.15, 885.36, 315.21]);
    expect(values('insuranceMaintenance')).toEqual([500.6, 508.11, 1257.56, 749.45]);
    expect(values('other')).toEqual([1649.41, 0, 29.96, 29.96]);
    expect(values('loan')).toEqual([10095.91, 10095.9, 10095.9, 0]);
    expect(values('outOfPocket')).toEqual([3083.5, 1304.15, 3957.96, 2653.81]);
  });

  it('détail « Au 25/10 » : N−1 à la même date et payé à ce jour', () => {
    expect(row(b, 'coOwnership').previousToDate).toBe(213_723);
    expect(row(b, 'coOwnership').paidToDate).toBe(379_160);
  });
});

describe('projection de la vente d’après le budget', () => {
  const data = loadTestDataset();
  const property = data.properties[0]!;
  const asOf = '2026-10-25';

  it('loyer net = (loyers − gestion et comptable) / 12 ; dépenses = copropriété, impôts, assurances', () => {
    const p = budgetProjection(data, property, asOf, GROWTH)!;
    expect(p.years).toEqual([2026]);
    // (13 908,70 − 1 575,52) / 12 ; 2 463,17 + 570,15 + 508,11.
    expect(p.netRentMonthly(2026)).toBeCloseTo((1_390_870 - 157_552) / 12, 6);
    expect(p.annualExpenses(2026)).toBe(246_317 + 57_015 + 50_811);
    // Années suivantes : dernier budget × (1 + évolution).
    expect(p.annualExpenses(2028)).toBeCloseTo((246_317 + 57_015 + 50_811) * 1.015 ** 2, 6);
  });

  it('un budget enregistré pour l’année suivante prend le relais', () => {
    const withNext = {
      ...data,
      budgets: [{ propertyId: property.id, year: 2027, planned: { coOwnership: 300_000 } }],
    };
    const p = budgetProjection(withNext, property, asOf, GROWTH)!;
    expect(p.years).toEqual([2026, 2027]);
    const next = yearBudget(withNext, property, 2027, asOf, GROWTH).rows;
    const plan = (id: BudgetRowId) => next.find((r) => r.id === id)!.planned;
    expect(p.annualExpenses(2027)).toBe(300_000 + plan('taxes') + plan('insuranceMaintenance'));
    expect(p.annualExpenses(2029)).toBeCloseTo(p.annualExpenses(2027) * 1.015 ** 2, 6);
  });

  it('Paramètres de vente : budget en calcul automatique, valeur modifiée prioritaire', () => {
    const auto = resolveSaleAssumptions(data, property, defaultAssumptions(property.id), asOf);
    expect(auto.projectionSource).toEqual({ kind: 'budget', years: [2026] });
    expect(auto.netRentMonthly.value).toBeCloseTo((1_390_870 - 157_552) / 12, 6);
    expect(auto.annualExpensesExcludingLoan.value).toBe(354_143);
    expect(auto.projection.monthlyProjectionForYear!(2027)).toBeCloseTo(
      ((1_390_870 - 157_552) / 12 - 354_143 / 12) * 1.015,
      6,
    );
    // Le jeu de test garde ses valeurs modifiées : la projection n'utilise pas le budget.
    const seed = resolveSaleAssumptions(data, property, data.assumptions[0]!, asOf);
    expect(seed.netRentMonthly).toMatchObject({ value: 105_661, modified: true });
    expect(seed.projection.monthlyProjectionForYear).toBeUndefined();
  });

  it('sans budget (location commencée l’année des données) : 12 derniers mois du journal', () => {
    const recent = { ...property, rentalStartDate: '2026-01-01' };
    const d = { ...data, properties: [recent] };
    const r = resolveSaleAssumptions(d, recent, defaultAssumptions(recent.id), asOf);
    expect(r.projectionSource).toEqual({ kind: 'journal' });
    expect(r.projection.monthlyProjectionForYear).toBeUndefined();
  });
});
