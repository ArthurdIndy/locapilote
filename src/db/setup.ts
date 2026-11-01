import type { Dataset } from '../engine/types';
import type { LocapiloteDb } from './database';
import { defaultCategories } from './defaultCategories';
import { loadTestDataset } from './testDataset';

/** Premier lancement : charge le jeu de test anonymisé (remplace tout). */
export function startWithTestDataset(db: LocapiloteDb): Promise<void> {
  return db.replaceAll(loadTestDataset());
}

/** Premier lancement : aucune donnée, seulement les catégories par défaut. */
export function startEmpty(db: LocapiloteDb): Promise<void> {
  const empty: Dataset = {
    properties: [],
    categories: defaultCategories(),
    transactions: [],
    loans: [],
    loanInstallments: [],
    assets: [],
    accountantCarryforwards: [],
    preRentalExpenses: [],
    assumptions: [],
  };
  return db.replaceAll(empty);
}
