import { describe, expect, it } from 'vitest';
import { upgradeAssumptionsToV4, upgradeDataToV4 } from './migrations';

const v3 = {
  propertyId: 'B1',
  sale: {
    agencyFeesRate: 0.04,
    otherSaleCosts: 167400,
    earlyRepaymentPenalty: 0,
    actualAcquisitionCosts: 2790000,
    incomeTaxRate: 0.19,
    socialChargesRate: 0.172,
  },
  projection: {
    avoidedRentMonthlyAtPurchase: 97650,
    avoidedRentIndexation: 0.0178,
    netRentMonthly: 105661,
    annualExpensesExcludingLoan: 0,
    annualGrowth: 0.015,
    depreciationDeductedPerYear: 0,
    saleYearCosts: 55800,
    mainResidenceReinvestedShare: 0,
    otherDebts: 0,
  },
  saleScenarios: [{ date: '2027-06-30', price: 27900000 }],
  dataAsOf: '2026-10-25',
};

describe('passage des hypothèses de vente à la version 4', () => {
  it('reprend les valeurs saisies, met en calcul automatique celles à 0', () => {
    const { assumptions, actualAcquisitionCosts } = upgradeAssumptionsToV4(v3);
    expect(actualAcquisitionCosts).toBe(2790000);
    expect(assumptions.sale).toEqual({
      agencyFeesRate: 0.04,
      otherSaleCosts: 167400,
      earlyRepaymentPenalty: 0,
    });
    expect(assumptions.projection).toEqual({
      avoidedRentMonthlyAtPurchase: 97650,
      avoidedRentIndexation: 0.0178,
      netRentMonthly: 105661,
      annualExpensesExcludingLoan: null,
      annualGrowth: 0.015,
      depreciationDeductedPerYear: null,
      saleYearCosts: 55800,
      mainResidenceReinvestedShare: null,
      otherDebts: 0,
    });
    expect(assumptions.saleScenarios).toHaveLength(1);
    expect(assumptions.dataAsOf).toBe('2026-10-25');
  });

  it('reporte les frais d’acquisition réels sur la fiche du bien', () => {
    const data = upgradeDataToV4({
      properties: [
        { id: 'B1', name: 'Bien' },
        { id: 'B2', name: 'Autre' },
      ],
      assumptions: [v3],
    });
    expect(data.properties).toEqual([
      { id: 'B1', name: 'Bien', actualAcquisitionCosts: 2790000 },
      { id: 'B2', name: 'Autre', actualAcquisitionCosts: 0 },
    ]);
  });
});
