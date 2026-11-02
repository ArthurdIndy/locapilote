/**
 * Plus-value à la vente, selon le régime fiscal du bien. Un module par régime : chacun dit
 * quelles règles s'appliquent et ce qu'il faut réintégrer.
 *
 * - LMNP réel : régime des particuliers, amortissements déduits réintégrés (LF 2025) ;
 * - autres régimes (micro-BIC, location nue, LMP) : pas encore disponibles. Le LMP relève des
 *   plus-values professionnelles et aura son propre module.
 */
import { LMNP_REEL, deductedDepreciationByYear, type DeductedDepreciationYear } from '../lmnp-reel';
import type { Cents, Dataset, IsoDate, Property, PropertyAssumptions } from '../../types';
import { privateCapitalGain, type CapitalGain } from './private-individuals';

export interface CapitalGainResult extends CapitalGain {
  /** Détail des amortissements réintégrés, par année. */
  depreciationYears: DeductedDepreciationYear[];
}

export interface CapitalGainContext {
  data: Dataset;
  property: Property;
  assumptions: PropertyAssumptions;
  dataAsOf: IsoDate;
  saleDate: IsoDate;
  netSalePrice: Cents;
}

export type CapitalGainModule = (context: CapitalGainContext) => CapitalGainResult;

/** LMNP réel : régime des particuliers, avec réintégration des amortissements déduits. */
const lmnpReelCapitalGain: CapitalGainModule = ({
  data,
  property,
  assumptions,
  dataAsOf,
  saleDate,
  netSalePrice,
}) => {
  const depreciationYears = deductedDepreciationByYear(
    data,
    property,
    dataAsOf,
    Number(saleDate.slice(0, 4)),
    assumptions.projection.depreciationDeductedPerYear,
  );
  const gain = privateCapitalGain({
    acquisitionDate: property.acquisitionDate,
    saleDate,
    netSalePrice,
    purchasePrice: property.purchasePrice - property.furnitureIncluded,
    actualAcquisitionCosts: assumptions.sale.actualAcquisitionCosts,
    depreciationDeducted: depreciationYears.reduce((sum, y) => sum + y.amount, 0),
    incomeTaxRate: assumptions.sale.incomeTaxRate,
    socialChargesRate: assumptions.sale.socialChargesRate,
  });
  return { ...gain, depreciationYears };
};

/** Module de plus-value du régime du bien ; `null` = pas encore disponible pour ce régime. */
export function capitalGainModuleFor(property: Property): CapitalGainModule | null {
  return property.taxRegime === LMNP_REEL ? lmnpReelCapitalGain : null;
}
