import type { BudgetRowId } from '../engine/core/budget';
import type {
  BudgetLine,
  Category,
  CategoryDirection,
  RentalType,
  TaxRegime,
} from '../engine/types';

export const REGIME_LABELS: Record<TaxRegime, string> = {
  'lmnp-micro-bic': 'LMNP micro-BIC',
  'lmnp-reel': 'LMNP au réel',
  'lmp-reel': 'LMP au réel',
  'micro-foncier': 'Micro-foncier',
  'reel-foncier': 'Réel foncier',
};

export const RENTAL_TYPE_LABELS: Record<RentalType, string> = {
  furnished: 'Meublée',
  seasonal: 'Saisonnière',
  unfurnished: 'Nue',
};

export const DIRECTION_LABELS: Record<CategoryDirection, string> = {
  income: 'Recettes',
  expense: 'Dépenses',
  transfer: 'Transferts',
  neutral: 'Neutres (dépôt de garantie)',
};

/** Ordre d'affichage des catégories : recettes, dépenses, transferts, neutres. */
export const DIRECTION_ORDER: CategoryDirection[] = ['income', 'expense', 'transfer', 'neutral'];

/** Trie les catégories : recettes, dépenses, transferts, neutres ; puis par nom. */
export function sortCategories(categories: readonly Category[]): Category[] {
  return [...categories].sort(
    (a, b) =>
      DIRECTION_ORDER.indexOf(a.direction) - DIRECTION_ORDER.indexOf(b.direction) ||
      a.name.localeCompare(b.name, 'fr'),
  );
}

/** Libellés des lignes du budget (US12), dans l'ordre de l'écran. */
export const BUDGET_ROW_LABELS: Record<BudgetRowId, string> = {
  income: 'Loyers et charges perçus',
  coOwnership: 'Copropriété',
  management: 'Gestion et comptable',
  taxes: 'Impôts et taxes',
  insuranceMaintenance: 'Assurances et entretien',
  other: 'Autres dépenses',
  loan: 'Prêt (échéances)',
  outOfPocket: 'À sortir de ta poche',
};

/** Ligne du budget dans l'adresse de la liste des opérations (#/operations?budget=copropriete). */
export const BUDGET_LINE_SLUGS: Record<BudgetLine, string> = {
  income: 'loyers',
  coOwnership: 'copropriete',
  management: 'gestion',
  taxes: 'impots',
  insuranceMaintenance: 'assurances',
  other: 'autres',
};
