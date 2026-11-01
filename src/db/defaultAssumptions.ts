import type { IsoDate, PropertyAssumptions } from '../engine/types';

/**
 * Hypothèses d'un bien qui n'en a pas encore : tout à zéro, sauf les taux légaux d'imposition
 * de la plus-value (19 % et 17,2 %). Elles deviendront modifiables avec les simulations (US11).
 * `dataAsOf` vide = date du jour (voir `effectiveDataAsOf`).
 */
export function defaultAssumptions(
  propertyId: string,
  dataAsOf: IsoDate = '',
): PropertyAssumptions {
  return {
    propertyId,
    sale: {
      agencyFeesRate: 0,
      otherSaleCosts: 0,
      earlyRepaymentPenalty: 0,
      actualAcquisitionCosts: 0,
      incomeTaxRate: 0.19,
      socialChargesRate: 0.172,
    },
    projection: {
      avoidedRentMonthlyAtPurchase: 0,
      avoidedRentIndexation: 0,
      netRentMonthly: 0,
      annualExpensesExcludingLoan: 0,
      annualGrowth: 0,
      depreciationDeductedPerYear: 0,
      saleYearCosts: 0,
      mainResidenceReinvestedShare: 0,
      otherDebts: 0,
    },
    saleScenarios: [],
    dataAsOf,
  };
}

/** Date de mise à jour des données d'un bien : celle saisie, sinon aujourd'hui. */
export function effectiveDataAsOf(
  assumptions: readonly PropertyAssumptions[],
  propertyId: string,
  today: IsoDate,
): { date: IsoDate; isDefault: boolean } {
  const saved = assumptions.find((a) => a.propertyId === propertyId)?.dataAsOf;
  return saved ? { date: saved, isDefault: false } : { date: today, isDefault: true };
}
