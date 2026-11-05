/**
 * Mémoire d'affichage d'une page (l'année du Budget, la fenêtre d'années de la Synthèse) :
 *
 * - dans l'adresse (#/budget?annee=2025) : le bouton « retour » du navigateur revient sur ce qui
 *   était affiché, et un lien vers une année précise fonctionne ;
 * - pour la session (sessionStorage) : un clic sur la page dans le menu, sans paramètre, revient
 *   au dernier choix ; une nouvelle visite (onglet fermé puis rouvert) repart de la valeur par
 *   défaut.
 *
 * Préférence d'affichage, pas une donnée : rien n'est dans l'export.
 */
import { routeHref, type RouteId } from './router';

export function readSessionValue(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Stockage indisponible (navigation privée) : l'adresse suffit pour le retour.
  }
}

/**
 * Valeur demandée par l'adresse (`param`), sinon le dernier choix de la session, sinon `null`
 * (la page prend alors sa valeur par défaut).
 */
export function initialViewValue(
  params: URLSearchParams | undefined,
  param: string,
  storageKey: string,
): string | null {
  return params?.get(param) ?? readSessionValue(storageKey);
}

/**
 * Retient un choix : remplace l'adresse courante (sans nouvelle entrée d'historique, le retour
 * mène donc à la page précédente) et le garde pour la session.
 */
export function rememberViewValue(
  route: RouteId,
  param: string,
  value: string,
  storageKey: string,
): void {
  writeSessionValue(storageKey, value);
  const params = new URLSearchParams(window.location.hash.replace(/^#\/?[^?]*\??/, ''));
  params.set(param, value);
  window.history.replaceState(
    window.history.state,
    '',
    routeHref(route, Object.fromEntries(params)),
  );
}
