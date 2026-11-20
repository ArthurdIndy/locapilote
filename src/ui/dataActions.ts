/**
 * Actions sur toutes les données, partagées par l'Accueil, ⚙ Paramètres et les confirmations :
 * télécharger la sauvegarde complète, charger l'exemple. Chacune remet à zéro le rappel de
 * sauvegarde.
 */
import { buildBackup, serializeBackup } from '../db/backup';
import { db } from '../db/database';
import { startWithTestDataset } from '../db/setup';
import type { IsoDate } from '../engine/types';
import { recordBackup } from './backupReminder';
import { downloadText } from './download';

/** Télécharge la sauvegarde complète (fichier JSON), relue directement dans la base. */
export async function downloadBackup(today: IsoDate): Promise<void> {
  const backup = buildBackup(await db.readAll());
  downloadText(`locapilote-sauvegarde-${today}.json`, serializeBackup(backup), 'application/json');
  recordBackup(today);
}

/** Remplace toutes les données par l'exemple (appartement fictif du jeu de test). */
export async function loadExample(today: IsoDate): Promise<void> {
  await startWithTestDataset(db);
  recordBackup(today);
}
