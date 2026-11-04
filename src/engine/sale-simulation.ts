/**
 * Simulation de vente d'un bien (US11) : assemble le socle commun (somme perçue, bilan depuis
 * l'achat, TRI) et le module de plus-value du régime du bien. Voir docs/regles-de-calcul.md
 * § 5 et § 6.
 */
import {
  gainOverReference,
  ownerBalance,
  waitingGain,
  waitingYield,
  type OwnerBalance,
} from './core/irr';
import { resolve, resolveSaleAssumptions, type ResolvedSaleAssumptions } from './sale-defaults';
import { defaultReinvestedShare, saleProceeds, type SaleProceeds } from './core/sale';
import { capitalGainModuleFor, type CapitalGainResult } from './tax/capital-gain';
import {
  reinvestmentExemption,
  type ReinvestmentExemption,
} from './tax/capital-gain/private-individuals';
import type { Cents, Dataset, IsoDate, Property, PropertyAssumptions, SaleScenario } from './types';

/** Placement de référence : taux annuel et libellé (« fonds euros », « ETF »…). */
export interface ReferenceInvestment {
  rate: number;
  label: string;
}

export interface SaleSimulation {
  scenario: SaleScenario;
  /** Hypothèses retenues, valeurs calculées automatiquement comprises. */
  resolved: ResolvedSaleAssumptions;
  proceeds: SaleProceeds;
  /** `null` : pas encore de module de plus-value pour le régime du bien (impôt compté à 0). */
  capitalGain: CapitalGainResult | null;
  tax: Cents;
  /** Somme nette perçue = somme avant impôt − impôt sur la plus-value. */
  netProceeds: Cents;
  otherDebts: Cents;
  /** Somme disponible pour le prochain achat = somme nette − autres dettes. */
  available: Cents;
  reinvestment: ReinvestmentExemption;
  /** Montant à réinvestir dans la résidence principale = part réinvestie × prix de cession. */
  reinvestedAmount: Cents;
  /** Somme nette avec remploi = somme nette + impôt évité. */
  netWithReinvestment: Cents;
  balance: OwnerBalance;
  /**
   * Ce qui te reste vraiment = somme nette perçue − ce qu'il faut remettre d'ici la vente
   * (cash-flow d'ici la vente, négatif quand il faut remettre de l'argent).
   */
  netAfterCashFlow: number;
  /** Gain par rapport au placement de référence, à la date de vente ; `null` sans placement. */
  gainOverReference: number | null;
}

/** Raison pour laquelle un scénario ne peut pas être calculé. */
export type SaleSimulationError = 'sale-before-acquisition';

export function simulateSale(
  data: Dataset,
  property: Property,
  assumptions: PropertyAssumptions,
  dataAsOf: IsoDate,
  scenario: SaleScenario,
  reference: ReferenceInvestment | null = null,
): SaleSimulation | { error: SaleSimulationError } {
  if (scenario.date <= property.acquisitionDate) return { error: 'sale-before-acquisition' };
  const proceeds = saleProceeds(data, property, assumptions.sale, scenario);
  const common = resolveSaleAssumptions(data, property, assumptions, dataAsOf);
  // Part réinvestie par défaut : ce qui reste du prix de cession après remboursement du prêt.
  const resolved: ResolvedSaleAssumptions = {
    ...common,
    reinvestedShare: resolve(
      assumptions.projection.mainResidenceReinvestedShare,
      defaultReinvestedShare(proceeds),
    ),
  };
  const module = capitalGainModuleFor(property);
  const capitalGain = module
    ? module({
        data,
        property,
        assumedDepreciationPerYear: resolved.depreciationDeductedPerYear.value,
        dataAsOf,
        saleDate: scenario.date,
        netSalePrice: proceeds.netSalePrice,
      })
    : null;
  const tax = capitalGain?.tax ?? 0;
  const netProceeds = proceeds.beforeTax - tax;
  const reinvestment = reinvestmentExemption(
    scenario.date,
    property.mainResidenceEndDate,
    tax,
    resolved.reinvestedShare.value,
  );
  const balance = ownerBalance({
    data,
    property,
    projection: resolved.projection,
    dataAsOf,
    saleDate: scenario.date,
    netSaleProceeds: netProceeds,
  });
  return {
    scenario,
    resolved,
    proceeds,
    capitalGain,
    tax,
    netProceeds,
    otherDebts: assumptions.projection.otherDebts,
    available: netProceeds - assumptions.projection.otherDebts,
    reinvestment,
    reinvestedAmount: Math.round(resolved.reinvestedShare.value * proceeds.netSalePrice),
    netWithReinvestment: netProceeds + reinvestment.avoidedTax,
    balance,
    netAfterCashFlow: netProceeds + balance.cashFlowUntilSale,
    gainOverReference: reference
      ? gainOverReference(balance.flows, reference.rate, scenario.date)
      : null,
  };
}

export function isSaleSimulation(
  result: SaleSimulation | { error: SaleSimulationError },
): result is SaleSimulation {
  return !('error' in result);
}

/** Rendement de l'attente d'un scénario par rapport au précédent (scénarios triés par date). */
export function waitingYieldBetween(previous: SaleSimulation, next: SaleSimulation): number | null {
  return waitingYield(
    {
      date: previous.scenario.date,
      totalGain: previous.balance.totalGain,
      netSaleProceeds: previous.netProceeds,
    },
    { date: next.scenario.date, totalGain: next.balance.totalGain },
  );
}

/**
 * Gain de l'attente d'un scénario par rapport au précédent (scénarios triés par date) : somme
 * nette en plus, moins le cash-flow remis entre les deux dates. `null` à la même date (pas
 * d'attente).
 */
export function waitingGainBetween(previous: SaleSimulation, next: SaleSimulation): number | null {
  return waitingGain(
    {
      date: previous.scenario.date,
      netSaleProceeds: previous.netProceeds,
      cashFlowUntilSale: previous.balance.cashFlowUntilSale,
    },
    {
      date: next.scenario.date,
      netSaleProceeds: next.netProceeds,
      cashFlowUntilSale: next.balance.cashFlowUntilSale,
    },
  );
}
