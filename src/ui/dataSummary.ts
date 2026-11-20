/**
 * Résumés des données, pour les confirmations (suppression d'un bien, chargement de l'exemple).
 * Fonctions pures.
 */
import type { Dataset } from '../engine/types';
import { plural } from './format';

/** Ce qui est rattaché à un bien. */
export interface PropertyFootprint {
  transactions: number;
  loans: number;
  installments: number;
  assets: number;
  budgets: number;
  saleScenarios: number;
  /** Comptes déposés, stocks reportés, dépenses avant location. */
  taxData: number;
}

export function propertyFootprint(data: Dataset, propertyId: string): PropertyFootprint {
  const loanIds = new Set(data.loans.filter((l) => l.propertyId === propertyId).map((l) => l.id));
  const mine = <T extends { propertyId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.propertyId === propertyId).length;
  return {
    transactions: mine(data.transactions),
    loans: loanIds.size,
    installments: data.loanInstallments.filter((i) => loanIds.has(i.loanId)).length,
    assets: mine(data.assets),
    budgets: mine(data.budgets),
    saleScenarios:
      data.assumptions.find((a) => a.propertyId === propertyId)?.saleScenarios.length ?? 0,
    taxData:
      mine(data.accountantFilings) +
      mine(data.accountantCarryforwards) +
      mine(data.preRentalExpenses),
  };
}

/** « a, b et c ». */
function joinFr(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`;
}

/**
 * Texte de la confirmation de suppression d'un bien : « Tout ce qui le concerne sera supprimé :
 * 289 opérations, 1 prêt et ses 240 échéances, … C'est définitif. » Une partie absente n'est pas
 * citée.
 */
export function describePropertyDeletion(fp: PropertyFootprint): string {
  const parts: string[] = [];
  if (fp.transactions > 0) parts.push(plural(fp.transactions, 'opération'));
  if (fp.loans > 0) {
    const loans = plural(fp.loans, 'prêt');
    parts.push(
      fp.installments > 0
        ? `${loans} et ${fp.loans > 1 ? 'leurs' : 'ses'} ${plural(fp.installments, 'échéance')}`
        : loans,
    );
  }
  if (fp.assets > 0) parts.push(plural(fp.assets, 'immobilisation'));
  if (fp.budgets > 0) parts.push('les budgets');
  if (fp.saleScenarios > 0) parts.push('les scénarios de vente');
  if (fp.taxData > 0) parts.push('les données fiscales');
  if (parts.length === 0) return 'Le bien sera supprimé. C’est définitif.';
  return `Tout ce qui le concerne sera supprimé\u00a0: ${joinFr(parts)}. C’est définitif.`;
}

/** Toutes les données, tous biens confondus : « 1 bien, 289 opérations, 240 échéances ». */
export function describeAllData(data: Dataset): string {
  return [
    plural(data.properties.length, 'bien'),
    plural(data.transactions.length, 'opération'),
    plural(data.loanInstallments.length, 'échéance'),
  ].join(', ');
}
