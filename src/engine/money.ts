import type { Cents } from './types';

/** Convertit un montant en euros (au plus 2 décimales) en centimes entiers. */
export function eurosToCents(euros: number): Cents {
  const cents = Math.round(euros * 100);
  return Object.is(cents, -0) ? 0 : cents;
}

/** Convertit des centimes en euros (pour l'affichage ou la comparaison). */
export function centsToEuros(cents: Cents): number {
  return cents / 100;
}
