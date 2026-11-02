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

const percentFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 0.045922 → « 4,59 % » */
export function formatPercent(rate: number): string {
  return percentFormat.format(rate);
}

const decimalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** 7.49589 → « 7,5 » */
export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

const twoDecimalsFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Mois de location, toujours avec deux décimales : 7.49589 → « 7,50 », 12 → « 12,00 ». */
export function formatMonths(value: number): string {
  return twoDecimalsFormat.format(value);
}

const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 2032-12-05 » → « décembre 2032 » (sans passer par Date). */
export function formatMonthYear(date: IsoDate): string {
  const [year, month] = date.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/**
 * Lit un taux saisi en pourcentage (« 1,5 », « 1.5 % ») et le renvoie en décimal (0.015).
 * Renvoie `null` si la saisie n'est pas valide.
 */
export function parsePercentInput(text: string): number | null {
  const cleaned = text.replace(/[\s\u00a0\u202f%]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  // Arrondi pour éviter 1.5 / 100 = 0.015000000000000001.
  return Math.round(Number(cleaned) * 1e6) / 1e8;
}

/** 0.015 → « 1,5 » (champ modifiable). */
export function rateToInput(rate: number): string {
  return String(Math.round(rate * 1e8) / 1e6).replace('.', ',');
}

/** « 22,388075 » ou « 5 » → nombre d'années (≥ 0) ; `null` si la saisie n'est pas valide. */
export function parseYearsInput(text: string): number | null {
  const cleaned = text.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Années acceptées pour une date saisie : au-delà, c'est une saisie en cours ou une faute de frappe. */
export const PLAUSIBLE_YEARS = { min: 2000, max: 2100 } as const;

/**
 * Date complète et plausible (AAAA-MM-JJ valide, année entre 2000 et 2100). Pendant la frappe,
 * le navigateur produit des dates valides mais absurdes (« 2 » → année 0002) : on les écarte.
 */
export function isPlausibleDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  if (year < PLAUSIBLE_YEARS.min || year > PLAUSIBLE_YEARS.max) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDay;
}
