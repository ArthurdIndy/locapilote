import { useEffect, useState } from 'react';

/** Toutes les pages de l'application. */
export const ROUTES = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'mouvements', label: 'Mouvements' },
  { id: 'synthese', label: 'Synthèse' },
  { id: 'fiscalite', label: 'Fiscalité' },
  { id: 'simulations', label: 'Simulations' },
  { id: 'mon-bien', label: 'Mon bien' },
  { id: 'parametres', label: 'Paramètres' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

/**
 * Les 6 entrées du menu principal, toutes visibles sur ordinateur. Sur téléphone, seules
 * celles marquées `phoneTab` restent en onglets (elles tiennent sur 375 px) ; les autres
 * passent dans le menu ☰, avec ⚙ Paramètres.
 */
export const MAIN_NAV: readonly { id: RouteId; label: string; phoneTab: boolean }[] = [
  { id: 'accueil', label: 'Accueil', phoneTab: true },
  { id: 'mouvements', label: 'Mouvements', phoneTab: true },
  { id: 'synthese', label: 'Synthèse', phoneTab: false },
  { id: 'fiscalite', label: 'Fiscalité', phoneTab: false },
  { id: 'simulations', label: 'Simulations', phoneTab: true },
  { id: 'mon-bien', label: 'Mon bien', phoneTab: false },
];

/** Sections de la fiche « Mon bien » (paramètre `section` de l'adresse). */
export const PROPERTY_SECTIONS = [
  { id: 'informations', label: 'Informations' },
  { id: 'pret', label: 'Prêt' },
  { id: 'immobilisations', label: 'Immobilisations' },
] as const;

export type PropertySectionId = (typeof PROPERTY_SECTIONS)[number]['id'];

/**
 * Anciennes adresses (avant le regroupement en 6 entrées) et leur nouvelle place : un favori
 * ou un lien ancien mène toujours au bon écran.
 */
const LEGACY_ROUTES: Record<string, { route: RouteId; params?: Record<string, string> }> = {
  biens: { route: 'mon-bien', params: { section: 'informations' } },
  pret: { route: 'mon-bien', params: { section: 'pret' } },
  immobilisations: { route: 'mon-bien', params: { section: 'immobilisations' } },
  donnees: { route: 'parametres' },
};

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
  const params = new URLSearchParams(query);

  const legacy = LEGACY_ROUTES[path];
  if (legacy) {
    for (const [name, value] of Object.entries(legacy.params ?? {})) params.set(name, value);
    const target = routeHref(legacy.route, Object.fromEntries(params));
    // Remplace l'ancienne adresse dans l'historique : « retour » ne repasse pas par elle.
    window.history.replaceState(window.history.state, '', target);
    return { route: legacy.route, params, key: target.slice(2) };
  }

  return {
    route: ROUTES.find((r) => r.id === path)?.id ?? 'accueil',
    params,
    key: hash,
  };
}

/** Page courante, lue dans l'adresse (#/mon-bien…) : le bouton « retour » du navigateur fonctionne. */
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

/** Adresse d'une section de « Mon bien » ; `newProperty` ouvre le formulaire d'ajout d'un bien. */
export function propertyHref(section: PropertySectionId, newProperty = false): string {
  return routeHref('mon-bien', newProperty ? { section, nouveau: '1' } : { section });
}
