/**
 * Passage des hypothèses de vente au format de la version 4 (US11 recentrée), commun à la base
 * (`database.ts`) et aux sauvegardes (`backup.ts`). Fonctions pures.
 *
 * - Les taux d'imposition de la plus-value (19 %, 17,2 %) deviennent des constantes du module
 *   fiscal : ils sortent des hypothèses.
 * - Les frais d'acquisition réels passent sur la fiche du bien.
 * - Les valeurs de projection deviennent « calcul automatique » (`null`) quand elles valaient 0
 *   (valeur par défaut, jamais saisie) ; une valeur non nulle déjà saisie est reprise comme
 *   valeur modifiée.
 */
import type { PropertyAssumptions } from '../engine/types';

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const orAuto = (v: unknown): number | null => (num(v) === 0 ? null : num(v));

/** Hypothèses au format 4, et les frais d'acquisition réels à reporter sur le bien. */
export function upgradeAssumptionsToV4(raw: Row): {
  assumptions: PropertyAssumptions;
  actualAcquisitionCosts: number;
} {
  const sale = isRow(raw.sale) ? raw.sale : {};
  const projection = isRow(raw.projection) ? raw.projection : {};
  return {
    assumptions: {
      propertyId: String(raw.propertyId),
      sale: {
        agencyFeesRate: num(sale.agencyFeesRate),
        otherSaleCosts: num(sale.otherSaleCosts),
        earlyRepaymentPenalty: num(sale.earlyRepaymentPenalty),
      },
      projection: {
        avoidedRentMonthlyAtPurchase: num(projection.avoidedRentMonthlyAtPurchase),
        avoidedRentIndexation: num(projection.avoidedRentIndexation),
        netRentMonthly: orAuto(projection.netRentMonthly),
        annualExpensesExcludingLoan: orAuto(projection.annualExpensesExcludingLoan),
        annualGrowth: orAuto(projection.annualGrowth),
        depreciationDeductedPerYear: orAuto(projection.depreciationDeductedPerYear),
        saleYearCosts: orAuto(projection.saleYearCosts),
        mainResidenceReinvestedShare: orAuto(projection.mainResidenceReinvestedShare),
        otherDebts: num(projection.otherDebts),
      },
      saleScenarios: Array.isArray(raw.saleScenarios)
        ? (raw.saleScenarios as PropertyAssumptions['saleScenarios'])
        : [],
      dataAsOf: typeof raw.dataAsOf === 'string' ? raw.dataAsOf : '',
    },
    actualAcquisitionCosts: num(sale.actualAcquisitionCosts),
  };
}

/**
 * Données d'une sauvegarde antérieure à la version 4 : hypothèses converties, frais
 * d'acquisition réels reportés sur leur bien (sans écraser une valeur déjà présente).
 */
export function upgradeDataToV4(data: Row): Row {
  if (!Array.isArray(data.assumptions) || !Array.isArray(data.properties)) return data;
  const costs = new Map<string, number>();
  const assumptions = data.assumptions.map((a: unknown) => {
    if (!isRow(a)) return a;
    const upgraded = upgradeAssumptionsToV4(a);
    costs.set(upgraded.assumptions.propertyId, upgraded.actualAcquisitionCosts);
    return upgraded.assumptions;
  });
  const properties = data.properties.map((p: unknown) =>
    isRow(p) && p.actualAcquisitionCosts === undefined && typeof p.id === 'string'
      ? { ...p, actualAcquisitionCosts: costs.get(p.id) ?? 0 }
      : p,
  );
  return { ...data, assumptions, properties };
}
