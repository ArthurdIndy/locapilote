import { createContext, useContext } from 'react';
import type { Property } from '../engine/types';

/**
 * Bien courant, partagé par toutes les pages d'un bien. Règle multi-biens : l'Accueil montre
 * tous les biens ; les autres pages montrent le bien courant, choisi dans leur titre.
 */
export interface CurrentPropertyValue {
  properties: readonly Property[];
  current: Property | null;
  setCurrentId: (id: string) => void;
}

export const CurrentPropertyContext = createContext<CurrentPropertyValue>({
  properties: [],
  current: null,
  setCurrentId: () => {},
});

export function useCurrentPropertyContext(): CurrentPropertyValue {
  return useContext(CurrentPropertyContext);
}
