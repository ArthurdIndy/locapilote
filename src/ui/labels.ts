import type { Category, CategoryDirection, RentalType, TaxRegime } from '../engine/types';

export const REGIME_LABELS: Record<TaxRegime, string> = {
  'lmnp-reel': 'LMNP au réel',
  'lmnp-micro-bic': 'LMNP micro-BIC',
  'micro-foncier': 'Micro-foncier',
  'reel-foncier': 'Réel foncier',
};

export const RENTAL_TYPE_LABELS: Record<RentalType, string> = {
  furnished: 'Meublée',
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
