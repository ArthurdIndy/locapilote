import type { Category } from '../engine/types';
import { loadTestDataset } from './testDataset';

/**
 * Catégories proposées à un nouvel utilisateur qui démarre vide : celles du jeu de test,
 * qui sont génériques (aucune donnée personnelle). Elles deviendront modifiables avec US02.
 */
export function defaultCategories(): Category[] {
  return loadTestDataset().categories;
}
