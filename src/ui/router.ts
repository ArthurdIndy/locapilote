import { useEffect, useState } from 'react';

export const ROUTES = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'biens', label: 'Biens' },
  { id: 'mouvements', label: 'Mouvements' },
  { id: 'pret', label: 'Prêt' },
  { id: 'synthese', label: 'Synthèse' },
  { id: 'donnees', label: 'Données' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

function readRoute(): RouteId {
  const id = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.find((r) => r.id === id)?.id ?? 'accueil';
}

/** Page courante, lue dans l'adresse (#/biens…) : le bouton « retour » du navigateur fonctionne. */
export function useRoute(): RouteId {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function routeHref(id: RouteId): string {
  return `#/${id}`;
}
