/**
 * Plus-value immobilière des particuliers (CGI art. 150 U à 150 VH), qui s'applique au LMNP
 * et à la location nue. Fonctions pures ; montants en centimes (non arrondis en cours de
 * calcul, l'impôt est arrondi au centime). Voir docs/regles-de-calcul.md § 5.
 *
 * Ce qui varie d'un régime à l'autre (amortissements à réintégrer en LMNP réel, rien en
 * location nue) est fourni par l'appelant : voir `index.ts`.
 */
import { addMonths, fullYearsBetween } from '../../dates';
import type { Cents, IsoDate } from '../../types';

/** Forfait des frais d'acquisition : 7,5 % du prix d'achat (CGI art. 150 VB II 4°). */
export const ACQUISITION_COSTS_FLAT_RATE = 0.075;
/** Forfait travaux : 15 % du prix d'achat, après plus de 5 ans de détention (150 VB II 4°). */
export const WORKS_FLAT_RATE = 0.15;
/** Surtaxe sur les plus-values élevées (CGI art. 1609 nonies G) : au-delà de 50 000 €. */
export const HIGH_GAIN_SURTAX_THRESHOLD: Cents = 5_000_000;

export interface CapitalGainInput {
  acquisitionDate: IsoDate;
  saleDate: IsoDate;
  /** Prix de cession = prix − frais de vente. */
  netSalePrice: Cents;
  /** Prix d'achat du logement, hors mobilier. */
  purchasePrice: Cents;
  actualAcquisitionCosts: Cents;
  /** Amortissements à réintégrer (0 hors LMNP réel). */
  depreciationDeducted: number;
  incomeTaxRate: number;
  socialChargesRate: number;
}

export interface CapitalGain {
  holdingYears: number;
  netSalePrice: Cents;
  purchasePrice: Cents;
  /** MAX(frais réels, 7,5 % du prix). */
  acquisitionCosts: number;
  acquisitionCostsIsFlat: boolean;
  /** 15 % du prix si détention de plus de 5 ans, sinon 0. */
  worksAllowance: number;
  depreciationDeducted: number;
  /** Prix d'acquisition corrigé = prix + frais + forfait travaux − amortissements. */
  adjustedCost: number;
  /** Plus-value brute = MAX(0, prix de cession − prix d'acquisition corrigé). */
  grossGain: number;
  incomeTaxAllowance: number;
  socialChargesAllowance: number;
  /** Plus-value imposable à l'impôt sur le revenu (après abattement). */
  taxableForIncomeTax: number;
  taxableForSocialCharges: number;
  incomeTax: number;
  socialCharges: number;
  /** Impôt total (IR + prélèvements sociaux), arrondi au centime. Surtaxe non comprise. */
  tax: Cents;
  /** Plus-value imposable supérieure à 50 000 € : surtaxe due, non calculée. */
  surtaxApplies: boolean;
}

/**
 * Abattement pour durée de détention, impôt sur le revenu : 6 % par année au-delà de la 5e
 * jusqu'à la 21e, 4 % la 22e (exonération totale après 22 ans).
 */
export function incomeTaxAllowance(holdingYears: number): number {
  if (holdingYears < 6) return 0;
  if (holdingYears <= 21) return (holdingYears - 5) * 0.06;
  return 1;
}

/**
 * Abattement pour durée de détention, prélèvements sociaux : 1,65 % par année au-delà de la
 * 5e jusqu'à la 21e, 1,60 % la 22e (28 % au total), puis 9 % par an (exonération après 30 ans).
 */
export function socialChargesAllowance(holdingYears: number): number {
  if (holdingYears < 6) return 0;
  if (holdingYears <= 21) return (holdingYears - 5) * 0.0165;
  if (holdingYears === 22) return 0.28;
  return Math.min(1, 0.28 + (holdingYears - 22) * 0.09);
}

/** Plus-value et impôt, régime des particuliers. */
export function privateCapitalGain(input: CapitalGainInput): CapitalGain {
  const holdingYears = fullYearsBetween(input.acquisitionDate, input.saleDate);
  const flatCosts = ACQUISITION_COSTS_FLAT_RATE * input.purchasePrice;
  const acquisitionCostsIsFlat = flatCosts > input.actualAcquisitionCosts;
  const acquisitionCosts = Math.max(input.actualAcquisitionCosts, flatCosts);
  const worksAllowance = holdingYears > 5 ? WORKS_FLAT_RATE * input.purchasePrice : 0;
  const adjustedCost =
    input.purchasePrice + acquisitionCosts + worksAllowance - input.depreciationDeducted;
  const grossGain = Math.max(0, input.netSalePrice - adjustedCost);
  const irAllowance = incomeTaxAllowance(holdingYears);
  const psAllowance = socialChargesAllowance(holdingYears);
  const taxableForIncomeTax = grossGain * (1 - irAllowance);
  const taxableForSocialCharges = grossGain * (1 - psAllowance);
  const incomeTax = taxableForIncomeTax * input.incomeTaxRate;
  const socialCharges = taxableForSocialCharges * input.socialChargesRate;
  return {
    holdingYears,
    netSalePrice: input.netSalePrice,
    purchasePrice: input.purchasePrice,
    acquisitionCosts,
    acquisitionCostsIsFlat,
    worksAllowance,
    depreciationDeducted: input.depreciationDeducted,
    adjustedCost,
    grossGain,
    incomeTaxAllowance: irAllowance,
    socialChargesAllowance: psAllowance,
    taxableForIncomeTax,
    taxableForSocialCharges,
    incomeTax,
    socialCharges,
    tax: Math.round(incomeTax + socialCharges),
    surtaxApplies: taxableForIncomeTax > HIGH_GAIN_SURTAX_THRESHOLD,
  };
}

/** Condition des 4 ans de l'exonération pour remploi : remplie, non remplie, ou sans objet. */
export type ReinvestmentCondition = 'met' | 'not-met' | 'not-applicable';

export interface ReinvestmentExemption {
  condition: ReinvestmentCondition;
  /** Date à partir de laquelle la condition des 4 ans est remplie (fin de RP + 4 ans). */
  eligibleFrom: IsoDate | null;
  /** Impôt évité = impôt × part du prix réinvestie dans une résidence principale. */
  avoidedTax: Cents;
}

/**
 * Exonération pour remploi (CGI art. 150 U II 1° bis) : première cession d'un logement autre
 * que la résidence principale, le vendeur n'ayant pas été propriétaire de sa résidence
 * principale dans les 4 ans (de date à date) avant la vente ; exonération à proportion de la
 * part du prix réinvestie dans une résidence principale sous 24 mois.
 *
 * Seule la condition des 4 ans est vérifiée, à partir de la fin d'occupation du bien comme
 * résidence principale (sans objet si le bien ne l'a jamais été) ; le reste est à confirmer
 * avec le notaire.
 */
export function reinvestmentExemption(
  saleDate: IsoDate,
  mainResidenceEndDate: IsoDate | null,
  tax: Cents,
  reinvestedShare: number,
): ReinvestmentExemption {
  if (!mainResidenceEndDate) {
    return { condition: 'not-applicable', eligibleFrom: null, avoidedTax: 0 };
  }
  const eligibleFrom = addMonths(mainResidenceEndDate, 48);
  const met = saleDate >= eligibleFrom;
  return {
    condition: met ? 'met' : 'not-met',
    eligibleFrom,
    avoidedTax: met ? Math.round(tax * Math.min(1, Math.max(0, reinvestedShare))) : 0,
  };
}
