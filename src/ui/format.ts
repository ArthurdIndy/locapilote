import { centsToEuros } from '../engine/money';
import type { Cents, IsoDate } from '../engine/types';

const euroFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** 10057100 → « 100 571,00 € » */
export function formatEuros(cents: Cents): string {
  return euroFormat.format(centsToEuros(cents));
}

/** « 2026-10-31 » → « 31/10/2026 » (sans passer par Date, donc sans fuseau horaire). */
export function formatDate(date: IsoDate): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** Date du jour dans le calendrier de l'utilisateur, au format ISO. */
export function todayIso(now: Date = new Date()): IsoDate {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
