import { describe, expect, it } from 'vitest';
import expected from '../../data/expected.json';
import seed from '../../data/seed.json';
import { loadTestDataset } from '../db/testDataset';
import { gainOverReference, xirr } from './core/irr';
import { centsToEuros } from './money';
import {
  isSaleSimulation,
  simulateSale,
  waitingGainBetween,
  waitingYieldBetween,
  type SaleSimulation,
} from './sale-simulation';
import {
  incomeTaxAllowance,
  reinvestmentExemption,
  socialChargesAllowance,
} from './tax/capital-gain/private-individuals';

const dataset = loadTestDataset();
const property = dataset.properties[0]!;
const assumptions = dataset.assumptions[0]!;
const dataAsOf = assumptions.dataAsOf;
/** Les trois scénarios de seed.json (le jeu de test chargé n'importe que le premier). */
const SEED_SCENARIOS = seed.hypotheses.scenarios_vente.map((s) => ({
  date: s.date,
  price: Math.round(s.prix * 100),
}));

function simulate(index: number, rate: number | null = null): SaleSimulation {
  const result = simulateSale(
    dataset,
    property,
    assumptions,
    dataAsOf,
    SEED_SCENARIOS[index]!,
    rate === null ? null : { rate, label: 'test' },
  );
  if (!isSaleSimulation(result)) throw new Error(result.error);
  return result;
}

const scenarios = [0, 1, 2].map((i) => simulate(i));

type Column = (string | number)[];
const vq = expected.vendre_quand as Record<string, Column>;
const euros = (v: number) => centsToEuros(v);

/** Montant (centimes) comparé à expected.json (euros), à 0,01 € près. */
function expectEuros(cents: number, target: number) {
  expect(Math.abs(euros(cents) - target)).toBeLessThanOrEqual(0.01 + 1e-9);
}
function expectRate(rate: number | null, target: number) {
  expect(rate).not.toBeNull();
  expect(Math.abs(rate! - target)).toBeLessThanOrEqual(0.0001);
}

describe('scénarios « Vendre quand » du jeu de test (expected.json)', () => {
  it('seed.json contient trois scénarios ; le jeu de test chargé n’importe que le premier', () => {
    expect(SEED_SCENARIOS.map((s) => s.date)).toEqual(['2027-06-30', '2028-06-30', '2029-06-30']);
    expect(assumptions.saleScenarios).toEqual([SEED_SCENARIOS[0]]);
  });

  const LINES: [string, (s: SaleSimulation) => number, 'eur' | 'rate' | 'raw'][] = [
    ['Prix de vente', (s) => s.proceeds.price, 'eur'],
    ["− Frais d'agence", (s) => -s.proceeds.agencyFees, 'eur'],
    ['− Frais divers de vente', (s) => -s.proceeds.otherSaleCosts, 'eur'],
    ['− Capital restant dû', (s) => -s.proceeds.outstandingPrincipal, 'eur'],
    ['− Indemnités de remboursement anticipé', (s) => -s.proceeds.earlyRepaymentPenalty, 'eur'],
    ['− Impôt sur la plus-value', (s) => -s.tax, 'eur'],
    ['Somme nette perçue', (s) => s.netProceeds, 'eur'],
    ['− Autres dettes à rembourser', (s) => -s.otherDebts, 'eur'],
    ['Somme disponible pour le prochain achat', (s) => s.available, 'eur'],
    ['Durée de détention (années pleines)', (s) => s.capitalGain!.holdingYears, 'raw'],
    ['Prix de cession (prix − frais de vente)', (s) => s.proceeds.netSalePrice, 'eur'],
    [
      "Prix d'achat + frais d'acquisition + forfait travaux 15 %",
      (s) =>
        s.capitalGain!.purchasePrice +
        s.capitalGain!.acquisitionCosts +
        s.capitalGain!.worksAllowance,
      'eur',
    ],
    [
      '− Amortissements déduits (années avant celle de la vente)',
      (s) => -s.capitalGain!.depreciationDeducted,
      'eur',
    ],
    ['Plus-value brute', (s) => s.capitalGain!.grossGain, 'eur'],
    [
      'Abattement pour durée de détention (impôt sur le revenu)',
      (s) => s.capitalGain!.incomeTaxAllowance,
      'rate',
    ],
    [
      'Abattement pour durée de détention (prélèvements sociaux)',
      (s) => s.capitalGain!.socialChargesAllowance,
      'rate',
    ],
    ['Impôt sur la plus-value', (s) => s.tax, 'eur'],
    ['Impôt évité si le prix est réinvesti', (s) => s.reinvestment.avoidedTax, 'eur'],
    ['Somme nette avec remploi', (s) => s.netWithReinvestment, 'eur'],
    ['Mois entre la mise à jour et la vente', (s) => s.balance.monthsUntilSale, 'raw'],
    ['Cash-flow à remettre de votre poche (total)', (s) => s.balance.cashFlowUntilSale, 'eur'],
    ['Capital remboursé sur la période', (s) => s.balance.principalRepaidUntilSale, 'eur'],
    ["Gain total depuis l'achat", (s) => s.balance.totalGain, 'eur'],
    ['TRI (rendement annuel de votre apport)', (s) => s.balance.irr ?? NaN, 'rate'],
  ];

  describe.each(LINES)('%s', (label, compute, kind) => {
    it.each([0, 1, 2])('scénario %#', (index) => {
      const target = vq[label]![index] as number;
      const value = compute(scenarios[index]!);
      if (kind === 'eur') expectEuros(value, target);
      else if (kind === 'rate') expectRate(value, target);
      else expect(value).toBe(target);
    });
  });

  it('condition des 4 ans pour le remploi', () => {
    const labels = { met: 'Oui', 'not-met': 'Non', 'not-applicable': 'Non applicable' };
    expect(scenarios.map((s) => labels[s.reinvestment.condition])).toEqual(
      vq["Condition des 4 ans pour l'exonération pour remploi"],
    );
  });

  it('rythme mensuel d’ici la vente, hors frais de l’année de la vente', () => {
    // 30/06/2027 : (2 515,02 − 558) / 8 mois ≈ 244,63 € à remettre par mois.
    const s = scenarios[0]!;
    expect(s.balance.monthlyCashFlowUntilSale).toBeCloseTo((-251502.46 + 55800) / 8, 1);
    expect(Math.round(-s.balance.monthlyCashFlowUntilSale!) / 100).toBe(244.63);
  });

  it('cash-flow à remettre, par mois', () => {
    scenarios.forEach((s, i) => {
      const perMonth = centsToEuros(s.balance.cashFlowUntilSale / s.balance.monthsUntilSale);
      expect(Math.abs(perMonth - (vq['Soit par mois']![i] as number))).toBeLessThanOrEqual(0.01);
    });
  });

  it('gain de l’attente entre deux scénarios (onglet Vendre quand, ligne « Gain en plus »)', () => {
    // (somme nette − somme nette précédente) + cash-flow remis entre les deux dates :
    // 5 276,52 € puis 4 730,15 € dans data/jeu-de-test.xlsx (Vendre quand, D58 et E58).
    expectEuros(waitingGainBetween(scenarios[0]!, scenarios[1]!)!, 5276.52439555728);
    expectEuros(waitingGainBetween(scenarios[1]!, scenarios[2]!)!, 4730.15169979016);
  });

  it('pas de gain de l’attente entre deux scénarios à la même date (seul le prix change)', () => {
    const sameDate = (price: number) => {
      const r = simulateSale(dataset, property, assumptions, dataAsOf, {
        date: '2027-06-30',
        price,
      });
      if (!isSaleSimulation(r)) throw new Error(r.error);
      return r;
    };
    expect(waitingGainBetween(sameDate(27900000), sameDate(30000000))).toBeNull();
    // Une date antérieure non plus (le tableau est trié par date).
    expect(waitingGainBetween(scenarios[1]!, scenarios[0]!)).toBeNull();
  });

  it('rendement de l’attente entre deux scénarios', () => {
    // (gain − gain précédent) / somme nette précédente / années d'attente (onglet Vendre quand).
    expectRate(waitingYieldBetween(scenarios[0]!, scenarios[1]!), 0.0288581898093851);
    expectRate(waitingYieldBetween(scenarios[1]!, scenarios[2]!), 0.0248334201321662);
  });
});

describe('bloc « revente » de expected.json (scénario 1)', () => {
  const r = expected.revente as Record<string, number>;
  const s = scenarios[0]!;
  const g = s.capitalGain!;
  it.each([
    ['Prix de vente', s.proceeds.price],
    ['− Frais divers de vente', -s.proceeds.otherSaleCosts],
    ['− Capital restant dû à la date de vente', -s.proceeds.outstandingPrincipal],
    ['Somme perçue avant impôt', s.proceeds.beforeTax],
    ['− Impôt sur la plus-value (calcul ci-dessous)', -s.tax],
    ['Somme nette perçue après impôt', s.netProceeds],
    ['Prix de cession (prix − frais de vente)', s.proceeds.netSalePrice],
    ["Prix d'acquisition du logement (hors mobilier)", g.purchasePrice],
    ["+ Frais d'acquisition (réels ou forfait 7,5 %, le plus élevé)", g.acquisitionCosts],
    ['+ Forfait travaux 15 % (détention de plus de 5 ans)', g.worksAllowance],
    ['− Amortissements déduits à réintégrer', -g.depreciationDeducted],
    ["Prix d'acquisition corrigé", g.adjustedCost],
    ['Plus-value brute', g.grossGain],
    ['Impôt sur le revenu', g.incomeTax],
    ['Prélèvements sociaux', g.socialCharges],
    ['Impôt total sur la plus-value', s.tax],
  ] as [string, number][])('%s', (label, value) => {
    expectEuros(value, r[label]!);
  });

  it('durée de détention et abattements', () => {
    expect(g.holdingYears).toBe(r['Durée de détention (années pleines)']);
    expectRate(
      g.incomeTaxAllowance,
      r['Abattement pour durée de détention (impôt sur le revenu)']!,
    );
    expectRate(
      g.socialChargesAllowance,
      r['Abattement pour durée de détention (prélèvements sociaux)']!,
    );
    expect(g.surtaxApplies).toBe(false);
  });

  it('amortissements réintégrés : comptable pour 2024-2025, outil pour 2026', () => {
    expect(g.depreciationYears.map((y) => [y.year, y.origin])).toEqual([
      [2024, 'accountant'],
      [2025, 'accountant'],
      [2026, 'computed'],
    ]);
    // Scénario 3 (vente en 2029) : hypothèse annuelle pour 2027 et 2028.
    expect(
      scenarios[2]!.capitalGain!.depreciationYears.slice(3).map((y) => [y.year, y.amount]),
    ).toEqual([
      [2027, 418500],
      [2028, 418500],
    ]);
  });
});

describe('part du prix réinvestie (remploi)', () => {
  const auto = {
    ...assumptions,
    projection: { ...assumptions.projection, mainResidenceReinvestedShare: null },
  };
  const at2028 = () => {
    const r = simulateSale(dataset, property, auto, dataAsOf, SEED_SCENARIOS[1]!);
    if (!isSaleSimulation(r)) throw new Error(r.error);
    return r;
  };

  it('par défaut : ce qui reste du prix de cession après remboursement du prêt', () => {
    const s = at2028();
    // (279 000 − 1 674 − 86 493,93) / (279 000 − 1 674) = 190 832,07 / 277 326 ≈ 68,81 %.
    expect(s.resolved.reinvestedShare.modified).toBe(false);
    expect(s.resolved.reinvestedShare.value).toBeCloseTo(19083207 / 27732600, 10);
    expect(Math.round(s.resolved.reinvestedShare.value * 10000) / 100).toBe(68.81);
    expect(s.reinvestedAmount).toBe(19083207);
    expect(s.reinvestment.avoidedTax).toBe(Math.round(s.tax * s.resolved.reinvestedShare.value));
    expect(s.netWithReinvestment).toBe(s.netProceeds + s.reinvestment.avoidedTax);
  });

  it('le jeu de test garde sa part de 100 % comme valeur modifiée', () => {
    const s = scenarios[1]!;
    expect(s.resolved.reinvestedShare).toMatchObject({ value: 1, modified: true });
    expect(s.resolved.reinvestedShare.automatic).toBeCloseTo(19083207 / 27732600, 10);
    expect(s.reinvestedAmount).toBe(27732600);
  });
});

describe('comparaison à un placement de référence', () => {
  it('avec un taux égal au TRI, le gain par rapport au placement vaut 0 €', () => {
    for (const s of scenarios) {
      const withReference = simulate(SEED_SCENARIOS.indexOf(s.scenario), s.balance.irr);
      expect(Math.abs(withReference.gainOverReference!)).toBeLessThan(0.5); // < 1 centime à l'arrondi
    }
  });

  it('un placement moins rémunérateur que le TRI donne un gain positif, et inversement', () => {
    expect(simulate(0, 0.02).gainOverReference!).toBeGreaterThan(0);
    expect(simulate(0, 0.08).gainOverReference!).toBeLessThan(0);
  });

  it('sans placement saisi, pas de comparaison', () => {
    expect(scenarios[0]!.gainOverReference).toBeNull();
  });

  it('gain par rapport au placement : flux capitalisés jusqu’à la date de vente', () => {
    const flows = [
      { date: '2020-01-01', amount: -10000 },
      { date: '2021-01-01', amount: 11000 },
    ];
    // 10 000 placés à 5 % pendant 366 jours ≈ 10 500 ; le bien a rendu 11 000.
    expect(gainOverReference(flows, 0.05, '2021-01-01')).toBeCloseTo(
      11000 - 10000 * Math.pow(1.05, 366 / 365),
      6,
    );
    expect(xirr(flows)).toBeCloseTo(Math.pow(1.1, 365 / 366) - 1, 8);
  });
});

describe('règles de la plus-value des particuliers', () => {
  it('abattements pour durée de détention', () => {
    expect([5, 6, 21, 22, 23].map(incomeTaxAllowance)).toEqual([0, 0.06, 0.96, 1, 1]);
    const ps = [5, 6, 21, 22, 23, 30, 31].map(socialChargesAllowance);
    expect(ps.map((v) => Math.round(v * 10000) / 10000)).toEqual([
      0, 0.0165, 0.264, 0.28, 0.37, 1, 1,
    ]);
  });

  it('remploi : 4 ans de date à date après la fin de la résidence principale', () => {
    expect(reinvestmentExemption('2027-10-31', '2023-11-01', 1000, 1).condition).toBe('not-met');
    expect(reinvestmentExemption('2027-11-01', '2023-11-01', 1000, 0.6)).toEqual({
      condition: 'met',
      eligibleFrom: '2027-11-01',
      avoidedTax: 600,
    });
    expect(reinvestmentExemption('2027-11-01', null, 1000, 1).condition).toBe('not-applicable');
  });

  it('surtaxe signalée au-delà de 50 000 € de plus-value imposable', () => {
    const s = simulateSale(dataset, property, assumptions, dataAsOf, {
      date: '2029-06-30',
      price: 50_000_000,
    });
    expect(isSaleSimulation(s) && s.capitalGain!.surtaxApplies).toBe(true);
  });

  it('une vente avant l’achat est refusée', () => {
    expect(
      simulateSale(dataset, property, assumptions, dataAsOf, { date: '2017-01-01', price: 1 }),
    ).toEqual({ error: 'sale-before-acquisition' });
  });

  it('pas de module de plus-value hors LMNP réel : impôt non calculé', () => {
    const s = simulateSale(
      dataset,
      { ...property, taxRegime: 'lmnp-micro-bic' },
      assumptions,
      dataAsOf,
      SEED_SCENARIOS[1]!,
    );
    expect(isSaleSimulation(s) && s.capitalGain).toBeNull();
  });
});
