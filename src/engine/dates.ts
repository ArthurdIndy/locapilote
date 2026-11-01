/**
 * Calculs de dates sur des chaînes ISO `AAAA-MM-JJ`, sans objet `Date` local :
 * aucun résultat ne dépend du fuseau horaire de l'appareil.
 */
import type { IsoDate } from './types';

export function parseIso(date: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

export function toIso(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

/** Ajoute des mois ; le jour est ramené au dernier jour du mois si besoin (31/01 + 1 mois = 28/02). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIso(date);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return toIso(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Dernier jour du mois de la date. */
export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIso(date);
  return toIso(year, month, daysInMonth(year, month));
}

/** Numéro de jour depuis une origine fixe (calendrier grégorien, en UTC pur). */
function dayNumber(date: IsoDate): number {
  const { year, month, day } = parseIso(date);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Nombre de jours de `from` à `to` (0 si même jour, négatif si `to` précède `from`). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from);
}

export function yearOf(date: IsoDate): number {
  return parseIso(date).year;
}

export function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { year, month, day } = parseIso(date);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}
