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

/**
 * Lit un montant saisi en euros (« 1 054,89 », « 1054.89 », « -12 », « 12 € ») et le
 * renvoie en centimes. Renvoie `null` si la saisie n'est pas un montant valide.
 */
export function parseEurosInput(text: string): Cents | null {
  const cleaned = text.replace(/[\s\u00a0\u202f\u20ac]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const [whole = '0', decimals = ''] = cleaned.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

/** Centimes → texte modifiable dans un champ (« 1054,89 »), sans symbole €. */
export function centsToInput(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const decimals = abs % 100;
  return `${sign}${Math.floor(abs / 100)}${decimals === 0 ? '' : `,${String(decimals).padStart(2, '0')}`}`;
}

/** Comparaison de textes sans tenir compte des accents ni de la casse (pour la recherche). */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
