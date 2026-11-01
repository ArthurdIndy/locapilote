import { useEffect, useState } from 'react';

export const ROUTES = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'biens', label: 'Biens' },
  { id: 'mouvements', label: 'Mouvements' },
  { id: 'pret', label: 'Prêt' },
  { id: 'immobilisations', label: 'Immobilisations' },
  { id: 'synthese', label: 'Synthèse' },
  { id: 'donnees', label: 'Données' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

export interface Location {
  route: RouteId;
  /** Paramètres après « ? » (#/mouvements?annee=2024), pour arriver sur une vue filtrée. */
  params: URLSearchParams;
  /** Adresse complète après « # », pour remonter un écran quand ses paramètres changent. */
  key: string;
}

function readLocation(): Location {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = hash.split('?');
  return {
    route: ROUTES.find((r) => r.id === path)?.id ?? 'accueil',
    params: new URLSearchParams(query),
    key: hash,
  };
}

/** Page courante, lue dans l'adresse (#/biens…) : le bouton « retour » du navigateur fonctionne. */
export function useLocation(): Location {
  const [location, setLocation] = useState(readLocation);
  useEffect(() => {
    const onChange = () => {
      setLocation(readLocation());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return location;
}

export function routeHref(id: RouteId, params?: Record<string, string>): string {
  const query = params ? new URLSearchParams(params).toString() : '';
  return `#/${id}${query ? `?${query}` : ''}`;
}
