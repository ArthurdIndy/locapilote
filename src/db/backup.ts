/**
 * Format de sauvegarde complète (US18) : un fichier JSON qui contient toutes les données.
 *
 * {
 *   "application": "locapilote",
 *   "formatVersion": 1,          // = version du schéma de la base au moment de l'export
 *   "exportedAt": "2026-10-31T17:00:00.000Z",
 *   "data": { properties: [...], categories: [...], transactions: [...], ... }
 * }
 *
 * Fonctions pures : aucune dépendance au navigateur ni à la base.
 */
import { isTaxRegimeCompatible, RENTAL_TYPES, TAX_REGIMES, type Dataset } from '../engine/types';
import { SCHEMA_VERSION } from './database';

export const BACKUP_APPLICATION = 'locapilote';

export interface Backup {
  application: typeof BACKUP_APPLICATION;
  formatVersion: number;
  exportedAt: string;
  data: Dataset;
}

export function buildBackup(data: Dataset, now: Date = new Date()): Backup {
  return {
    application: BACKUP_APPLICATION,
    formatVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

/** Erreur de lecture d'une sauvegarde, avec un message lisible par l'utilisateur. */
export class BackupError extends Error {}

const DATASET_KEYS = [
  'properties',
  'categories',
  'transactions',
  'loans',
  'loanInstallments',
  'assets',
  'accountantCarryforwards',
  'preRentalExpenses',
  'assumptions',
] as const satisfies readonly (keyof Dataset)[];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lit et vérifie une sauvegarde. Lève une `BackupError` si le fichier n'est pas
 * une sauvegarde Locapilote valide ; dans ce cas, rien ne doit être importé.
 */
export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('Le fichier n’est pas un fichier JSON valide.');
  }
  if (!isRow(json) || json.application !== BACKUP_APPLICATION || !isRow(json.data)) {
    throw new BackupError('Ce fichier n’est pas une sauvegarde Locapilote.');
  }
  const version = json.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BackupError('Version de sauvegarde absente ou invalide.');
  }
  if (version > SCHEMA_VERSION) {
    throw new BackupError(
      'Cette sauvegarde vient d’une version plus récente de Locapilote. Rechargez la page et réessayez.',
    );
  }
  const data = json.data;
  for (const key of DATASET_KEYS) {
    const table = data[key];
    if (!Array.isArray(table) || !table.every(isRow)) {
      throw new BackupError(`Sauvegarde incomplète : la liste « ${key} » est absente ou invalide.`);
    }
  }
  const dataset = data as unknown as Dataset;
  checkDataset(dataset);
  return {
    application: BACKUP_APPLICATION,
    formatVersion: version,
    exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : '',
    data: dataset,
  };
}

/** Contrôles de cohérence : types des champs essentiels et références entre données. */
function checkDataset(data: Dataset): void {
  const fail = (message: string): never => {
    throw new BackupError(`Sauvegarde invalide : ${message}`);
  };
  const isString = (v: unknown): v is string => typeof v === 'string';
  const isDate = (v: unknown) => isString(v) && ISO_DATE.test(v);
  const isCents = (v: unknown) => typeof v === 'number' && Number.isInteger(v);

  const unique = (ids: string[], what: string) => {
    const set = new Set(ids);
    if (set.size !== ids.length) fail(`identifiant en double dans ${what}.`);
    return set;
  };

  for (const p of data.properties) {
    if (!isString(p.id) || !isString(p.name)) fail('un bien n’a pas d’identifiant ou de nom.');
    if (!TAX_REGIMES.includes(p.taxRegime)) fail(`régime fiscal inconnu pour « ${p.name} ».`);
    if (!RENTAL_TYPES.includes(p.rentalType)) fail(`type de location inconnu pour « ${p.name} ».`);
    if (!isTaxRegimeCompatible(p.rentalType, p.taxRegime)) {
      fail(`le régime fiscal de « ${p.name} » n’est pas compatible avec son type de location.`);
    }
    if (!isDate(p.acquisitionDate)) fail(`date d’acquisition invalide pour « ${p.name} ».`);
  }
  const propertyIds = unique(
    data.properties.map((p) => p.id),
    'les biens',
  );

  for (const c of data.categories) {
    if (!isString(c.id) || !isString(c.name))
      fail('une catégorie n’a pas d’identifiant ou de nom.');
  }
  const categoryIds = unique(
    data.categories.map((c) => c.id),
    'les catégories',
  );

  for (const t of data.transactions) {
    if (!isString(t.id)) fail('un mouvement n’a pas d’identifiant.');
    if (!propertyIds.has(t.propertyId)) fail(`le mouvement ${t.id} renvoie à un bien inconnu.`);
    if (!categoryIds.has(t.categoryId)) {
      fail(`le mouvement ${t.id} renvoie à une catégorie inconnue.`);
    }
    if (!isDate(t.date)) fail(`date invalide pour le mouvement ${t.id}.`);
    if (!isCents(t.amount)) fail(`montant invalide pour le mouvement ${t.id}.`);
  }
  unique(
    data.transactions.map((t) => t.id),
    'les mouvements',
  );

  for (const l of data.loans) {
    if (!propertyIds.has(l.propertyId)) fail(`le prêt ${l.id} renvoie à un bien inconnu.`);
  }
  const loanIds = unique(
    data.loans.map((l) => l.id),
    'les prêts',
  );
  for (const e of data.loanInstallments) {
    if (!loanIds.has(e.loanId)) fail(`l’échéance ${e.number} renvoie à un prêt inconnu.`);
  }
  for (const row of [
    ...data.assets,
    ...data.accountantCarryforwards,
    ...data.preRentalExpenses,
    ...data.assumptions,
  ]) {
    if (!propertyIds.has(row.propertyId)) fail('une donnée renvoie à un bien inconnu.');
  }
}
