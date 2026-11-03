/**
 * Somme perçue à la vente d'un bien (socle commun, indépendant du régime fiscal) : prix, frais
 * de vente, capital restant dû à la date de vente, indemnités de remboursement anticipé.
 * L'impôt sur la plus-value est calculé à part, par le module du régime (`src/engine/tax/
 * capital-gain/`). Voir docs/regles-de-calcul.md § 5.
 */
import type { Cents, Dataset, IsoDate, Property, SaleAssumptions, SaleScenario } from '../types';
import { outstandingPrincipal } from './loan';

export interface SaleProceeds {
  date: IsoDate;
  price: Cents;
  /** Frais d'agence à la charge du vendeur (% du prix). */
  agencyFees: Cents;
  /** Frais divers de vente (diagnostics, état daté, mainlevée). */
  otherSaleCosts: Cents;
  /** Capital restant dû à la date de vente, tous les prêts du bien. */
  outstandingPrincipal: Cents;
  earlyRepaymentPenalty: Cents;
  /** Prix de cession pour la plus-value = prix − frais d'agence − frais divers. */
  netSalePrice: Cents;
  /** Somme perçue avant impôt = prix − frais − capital restant dû − indemnités. */
  beforeTax: Cents;
}

/** Somme perçue avant impôt sur la plus-value, pour un scénario (date, prix). */
export function saleProceeds(
  data: Dataset,
  property: Property,
  sale: SaleAssumptions,
  scenario: SaleScenario,
): SaleProceeds {
  const agencyFees = Math.round(scenario.price * sale.agencyFeesRate);
  const outstanding = data.loans
    .filter((l) => l.propertyId === property.id)
    .reduce((sum, l) => sum + outstandingPrincipal(l, data.loanInstallments, scenario.date), 0);
  const netSalePrice = scenario.price - agencyFees - sale.otherSaleCosts;
  return {
    date: scenario.date,
    price: scenario.price,
    agencyFees,
    otherSaleCosts: sale.otherSaleCosts,
    outstandingPrincipal: outstanding,
    earlyRepaymentPenalty: sale.earlyRepaymentPenalty,
    netSalePrice,
    beforeTax: netSalePrice - outstanding - sale.earlyRepaymentPenalty,
  };
}

/**
 * Part du prix réinvestie par défaut (exonération pour remploi) : ce qui reste du prix de
 * cession après remboursement du prêt = (prix − frais de vente − capital restant dû −
 * indemnités) / (prix − frais de vente), entre 0 et 1. La part du prix qui rembourse l'emprunt
 * du bien vendu ne compte pas comme remploi (docs/regles-de-calcul.md § 5).
 */
export function defaultReinvestedShare(proceeds: SaleProceeds): number {
  if (proceeds.netSalePrice <= 0) return 0;
  return Math.min(1, Math.max(0, proceeds.beforeTax / proceeds.netSalePrice));
}
