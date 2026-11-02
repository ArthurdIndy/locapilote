import { useCallback, useState } from 'react';

/**
 * Détails repliés ouverts (⊕ / ⊖), mémorisés dans ce navigateur : préférence d'affichage,
 * pas une donnée (elle n'est pas dans l'export). Fermés par défaut.
 */
export function useOpenDetails(storageKey: string) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
      return new Set(Array.isArray(stored) ? stored.filter((v) => typeof v === 'string') : []);
    } catch {
      return new Set();
    }
  });

  const toggle = useCallback(
    (id: string) => {
      setOpen((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // Stockage indisponible (navigation privée) : l'état vaut pour la session.
        }
        return next;
      });
    },
    [storageKey],
  );

  return { isOpen: (id: string) => open.has(id), toggle };
}
