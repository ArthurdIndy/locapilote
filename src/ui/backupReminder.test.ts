import { describe, expect, it } from 'vitest';
import {
  backupReminder,
  backupReminderText,
  currentBackupReminder,
  recordBackup,
  recordDataPresence,
  type KeyValueStorage,
} from './backupReminder';

/** Double du stockage du navigateur. */
function memoryStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('rappel de sauvegarde : règle', () => {
  it('dernière sauvegarde de plus de 15 jours : rappel avec le nombre de jours', () => {
    expect(backupReminder('2026-11-19', '2026-11-01', '2026-01-01')).toEqual({
      kind: 'stale',
      days: 18,
    });
    expect(backupReminderText({ kind: 'stale', days: 18 })).toBe(
      'Dernière sauvegarde il y a 18 jours.',
    );
    expect(backupReminder('2026-11-17', '2026-11-01', null)).toEqual({ kind: 'stale', days: 16 });
  });

  it('15 jours ou moins : pas de rappel', () => {
    expect(backupReminder('2026-11-16', '2026-11-01', '2026-01-01')).toBeNull();
    expect(backupReminder('2026-11-01', '2026-11-01', '2026-01-01')).toBeNull();
  });

  it('jamais exporté : rappel quand les premières données ont plus de 15 jours', () => {
    expect(backupReminder('2026-11-17', null, '2026-11-01')).toEqual({ kind: 'never' });
    expect(backupReminderText({ kind: 'never' })).toBe('Tu n’as pas encore exporté tes données.');
    expect(backupReminder('2026-11-16', null, '2026-11-01')).toBeNull();
    expect(backupReminder('2026-11-17', null, null)).toBeNull();
  });
});

describe('rappel de sauvegarde : dates du navigateur', () => {
  it('premières données notées au premier bien, effacées sans bien', () => {
    const s = memoryStorage();
    recordDataPresence(true, '2026-11-01', s);
    recordDataPresence(true, '2026-11-05', s); // la première date est gardée
    expect(currentBackupReminder('2026-11-17', s)).toEqual({ kind: 'never' });
    recordDataPresence(false, '2026-11-17', s);
    expect(currentBackupReminder('2026-11-30', s)).toBeNull();
  });

  it('remise à zéro après un export, un import ou le chargement de l’exemple', () => {
    // Les trois passent par recordBackup (voir dataActions.ts et DataPage.tsx).
    const s = memoryStorage();
    recordDataPresence(true, '2026-10-01', s);
    expect(currentBackupReminder('2026-11-01', s)).toEqual({ kind: 'never' });
    recordBackup('2026-11-01', s);
    expect(currentBackupReminder('2026-11-01', s)).toBeNull();
    expect(currentBackupReminder('2026-11-16', s)).toBeNull();
    expect(currentBackupReminder('2026-11-17', s)).toEqual({ kind: 'stale', days: 16 });
    recordBackup('2026-11-17', s);
    expect(currentBackupReminder('2026-11-17', s)).toBeNull();
  });

  it('stockage indisponible : pas de rappel, pas d’erreur', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
      removeItem: () => {
        throw new Error('bloqué');
      },
    };
    expect(() => recordBackup('2026-11-01', broken)).not.toThrow();
    expect(() => recordDataPresence(true, '2026-11-01', broken)).not.toThrow();
    expect(currentBackupReminder('2026-11-30', broken)).toBeNull();
    expect(currentBackupReminder('2026-11-30', null)).toBeNull();
  });
});
