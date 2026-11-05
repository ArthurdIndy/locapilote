import { useEffect, useState } from 'react';

/** Toutes les pages de l'application. */
export const ROUTES = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'synthese', label: 'Synthèse' },
  { id: 'budget', label: 'Budget' },
  { id: 'simulations', label: 'Simulations' },
  { id: 'fiscalite', label: 'Fiscalité' },
  { id: 'mon-bien', label: 'Mon bien' },
  { id: 'nouvelle-operation', label: 'Nouvelle opération' },
  { id: 'operations', label: 'Toutes les opérations' },
  { id: 'parametres', label: 'Paramètres' },
] as const;

export type RouteId = (typeof ROUTES)[number]['id'];

/**
 * Menu principal, dans l'ordre « maintenant, puis passé, présent, futur ». Ces 4 entrées sont à
 * gauche sur ordinateur, et en onglets en haut sur téléphone.
 */
export const MAIN_NAV: readonly { id: RouteId; label: string }[] = [
  { id: 'accueil', label: 'Accueil' },
  { id: 'synthese', label: 'Synthèse' },
  { id: 'budget', label: 'Budget' },
  { id: 'simulations', label: 'Simulations' },
];

/**
 * Entrées de second plan : à droite du menu sur ordinateur, plus discrètes (suivies du bouton
 * « + Opération » et de ⚙) ; dans le menu ☰ sur téléphone.
 */
export const SECONDARY_NAV: readonly { id: RouteId; label: string }[] = [
  { id: 'fiscalite', label: 'Fiscalité' },
  { id: 'mon-bien', label: 'Mon bien' },
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
  // « Mouvements » est devenu « opérations » (itération 4b) ; les filtres sont conservés.
  mouvements: { route: 'operations' },
};

/** Vrai dès qu'on a changé de page dans l'application : « retour » y reste. */
let navigatedInApp = false;

/** Revient à la page précédente de l'application, ou à l'Accueil si on vient d'ailleurs. */
export function goBack(): void {
  if (navigatedInApp) window.history.back();
  else window.location.hash = routeHref('accueil');
}

export interface Location {
  route: RouteId;
  /** Paramètres après « ? » (#/operations?annee=2024), pour arriver sur une vue filtrée. */
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
      navigatedInApp = true;
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
