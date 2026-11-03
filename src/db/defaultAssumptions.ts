import type { IsoDate, PropertyAssumptions } from '../engine/types';

/**
 * Hypothèses d'un bien qui n'en a pas encore : frais de vente à zéro, valeurs de projection en
 * calcul automatique (`null`), aucun scénario (Simulations › Vente en crée un par défaut).
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
    },
    projection: {
      avoidedRentMonthlyAtPurchase: 0,
      avoidedRentIndexation: 0,
      netRentMonthly: null,
      annualExpensesExcludingLoan: null,
      annualGrowth: null,
      depreciationDeductedPerYear: null,
      saleYearCosts: null,
      mainResidenceReinvestedShare: null,
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
