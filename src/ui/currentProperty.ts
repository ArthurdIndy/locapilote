import { useCallback, useState } from 'react';
import type { Property } from '../engine/types';

const STORAGE_KEY = 'locapilote.currentPropertyId';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Bien courant : celui proposé par défaut lors d'une saisie. Mémorisé dans ce navigateur
 * (préférence d'affichage, pas une donnée : il n'est pas dans l'export).
 */
export function useCurrentProperty(properties: readonly Property[]) {
  const [storedId, setStoredId] = useState(readStored);
  const current = properties.find((p) => p.id === storedId) ?? properties[0] ?? null;

  const setCurrentId = useCallback((id: string) => {
    setStoredId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la session.
    }
  }, []);

  return { current, setCurrentId };
}
