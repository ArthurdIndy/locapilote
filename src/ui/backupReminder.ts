/**
 * Rappel de sauvegarde (itération 5a), affiché sur l'Accueil seulement.
 *
 * Deux dates, propres à ce navigateur (préférences, pas des données : elles ne vont pas dans
 * l'export) :
 * - la dernière sauvegarde : export complet (Accueil ou ⚙ Paramètres), import d'une sauvegarde,
 *   chargement de l'exemple ;
 * - l'arrivée des premières données : notée dès qu'un bien existe, effacée quand il n'y en a
 *   plus.
 *
 * Le rappel apparaît quand la dernière sauvegarde a plus de 15 jours, ou, sans aucune
 * sauvegarde, quand les premières données ont plus de 15 jours.
 */
import { daysBetween } from '../engine/dates';
import type { IsoDate } from '../engine/types';

export const BACKUP_REMINDER_DAYS = 15;

const LAST_BACKUP_KEY = 'locapilote.derniereSauvegarde';
const FIRST_DATA_KEY = 'locapilote.premieresDonnees';

/** Ce qu'il faut du stockage du navigateur (`localStorage`, ou un double dans les tests). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type BackupReminder = { kind: 'stale'; days: number } | { kind: 'never' } | null;

/** Règle du rappel (fonction pure). */
export function backupReminder(
  today: IsoDate,
  lastBackup: IsoDate | null,
  firstData: IsoDate | null,
): BackupReminder {
  if (lastBackup) {
    const days = daysBetween(lastBackup, today);
    return days > BACKUP_REMINDER_DAYS ? { kind: 'stale', days } : null;
  }
  if (firstData && daysBetween(firstData, today) > BACKUP_REMINDER_DAYS) return { kind: 'never' };
  return null;
}

/** Texte du rappel. */
export function backupReminderText(reminder: Exclude<BackupReminder, null>): string {
  return reminder.kind === 'stale'
    ? `Dernière sauvegarde il y a ${reminder.days} jours.`
    : 'Tu n’as pas encore exporté tes données.';
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function read(storage: KeyValueStorage, key: string): IsoDate | null {
  try {
    const value = storage.getItem(key);
    return value && ISO.test(value) ? value : null;
  } catch {
    return null;
  }
}

function write(storage: KeyValueStorage, key: string, value: IsoDate | null): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Stockage indisponible (navigation privée) : pas de rappel, rien de grave.
  }
}

function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Rappel à afficher aujourd'hui, d'après les dates de ce navigateur. */
export function currentBackupReminder(
  today: IsoDate,
  storage: KeyValueStorage | null = browserStorage(),
): BackupReminder {
  if (!storage) return null;
  return backupReminder(today, read(storage, LAST_BACKUP_KEY), read(storage, FIRST_DATA_KEY));
}

/** Une sauvegarde vient d'être faite (export, import, exemple) : le compteur repart de zéro. */
export function recordBackup(today: IsoDate, storage = browserStorage()): void {
  if (storage) write(storage, LAST_BACKUP_KEY, today);
}

/**
 * Note l'arrivée des premières données (au premier bien), et l'efface quand il n'y a plus
 * aucun bien.
 */
export function recordDataPresence(
  hasData: boolean,
  today: IsoDate,
  storage = browserStorage(),
): void {
  if (!storage) return;
  if (!hasData) write(storage, FIRST_DATA_KEY, null);
  else if (!read(storage, FIRST_DATA_KEY)) write(storage, FIRST_DATA_KEY, today);
}
