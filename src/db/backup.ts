/**
 * Format de sauvegarde complète (US18) : un fichier JSON qui contient toutes les données.
 *
 * {
 *   "application": "locapilote",
 *   "formatVersion": 5,          // = version du schéma de la base au moment de l'export
 *   "exportedAt": "2026-10-31T17:00:00.000Z",
 *   "data": { properties: [...], categories: [...], transactions: [...], ... }
 * }
 *
 * Version 1 → 2 (US09) : les immobilisations reçoivent un identifiant, et la liste
 * `accountantFilings` (comptes déposés par le comptable) apparaît. Une sauvegarde en
 * version 1 reste lisible : elle est complétée à la lecture.
 *
 * Version 2 → 3 (US11) : la liste `householdSettings` (paramètres du foyer : placement de
 * référence) apparaît ; vide à la lecture d'une sauvegarde plus ancienne.
 *
 * Version 3 → 4 (US11 recentrée) : hypothèses de vente simplifiées et frais d'acquisition réels
 * sur la fiche du bien (voir `migrations.ts`).
 *
 * Version 4 → 5 (US12) : la liste `budgets` (valeurs prévues modifiées, par bien et par année)
 * apparaît ; vide à la lecture d'une sauvegarde plus ancienne.
 *
 * Fonctions pures : aucune dépendance au navigateur ni à la base.
 */
import {
  BUDGET_LINES,
  HOUSEHOLD_SETTINGS_ID,
  isTaxRegimeCompatible,
  RENTAL_TYPES,
  TAX_REGIMES,
  type Dataset,
} from '../engine/types';
import { SCHEMA_VERSION } from './database';
import { upgradeDataToV4 } from './migrations';

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
  'accountantFilings',
  'preRentalExpenses',
  'assumptions',
  'householdSettings',
  'budgets',
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
  const v2 = version < 2 ? upgradeFromV1(json.data) : json.data;
  const v3 = version < 3 ? { ...v2, householdSettings: v2.householdSettings ?? [] } : v2;
  const v4 = version < 4 ? upgradeDataToV4(v3) : v3;
  const data = version < 5 ? { ...v4, budgets: v4.budgets ?? [] } : v4;
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

/** Sauvegarde en version 1 : identifiant des immobilisations, comptes déposés vides. */
function upgradeFromV1(data: Row): Row {
  const assets = Array.isArray(data.assets)
    ? data.assets.map((a: unknown, index) =>
        isRow(a) && typeof a.id !== 'string' ? { ...a, id: `immo-${index + 1}` } : a,
      )
    : data.assets;
  return { ...data, assets, accountantFilings: data.accountantFilings ?? [] };
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
    if (!isString(t.id)) fail('une opération n’a pas d’identifiant.');
    if (!propertyIds.has(t.propertyId)) fail(`l’opération ${t.id} renvoie à un bien inconnu.`);
    if (!categoryIds.has(t.categoryId)) {
      fail(`l’opération ${t.id} renvoie à une catégorie inconnue.`);
    }
    if (!isDate(t.date)) fail(`date invalide pour l’opération ${t.id}.`);
    if (!isCents(t.amount)) fail(`montant invalide pour l’opération ${t.id}.`);
  }
  unique(
    data.transactions.map((t) => t.id),
    'les opérations',
  );

  for (const l of data.loans) {
    if (!propertyIds.has(l.propertyId)) fail(`le prêt ${l.id} renvoie à un bien inconnu.`);
    if (!isCents(l.principal)) fail(`montant invalide pour le prêt ${l.id}.`);
    if (
      l.scheduleSource !== undefined &&
      l.scheduleSource !== 'bank' &&
      l.scheduleSource !== 'estimated'
    ) {
      fail(`origine d’échéancier inconnue pour le prêt ${l.id}.`);
    }
  }
  const loanIds = unique(
    data.loans.map((l) => l.id),
    'les prêts',
  );
  for (const e of data.loanInstallments) {
    if (!loanIds.has(e.loanId)) fail(`l’échéance ${e.number} renvoie à un prêt inconnu.`);
    if (!isDate(e.date)) fail(`date invalide pour l’échéance ${e.number} du prêt ${e.loanId}.`);
    if (![e.principal, e.interest, e.insurance].every(isCents)) {
      fail(`montant invalide pour l’échéance ${e.number} du prêt ${e.loanId}.`);
    }
  }
  for (const a of data.assets) {
    if (!isString(a.id)) fail('une immobilisation n’a pas d’identifiant.');
    if (!isDate(a.inServiceDate)) fail(`date de mise en service invalide pour « ${a.component} ».`);
    if (!isCents(a.value)) fail(`valeur invalide pour « ${a.component} ».`);
    if (typeof a.durationYears !== 'number' || !(a.durationYears >= 0)) {
      fail(`durée d’amortissement invalide pour « ${a.component} ».`);
    }
  }
  unique(
    data.assets.map((a) => a.id),
    'les immobilisations',
  );
  for (const f of data.accountantFilings) {
    if (!isRow(f.amounts) || !isRow(f.comments)) fail(`comptes déposés ${f.year} invalides.`);
    if (!Object.values(f.amounts).every(isCents))
      fail(`montant invalide dans les comptes ${f.year}.`);
  }
  if (data.householdSettings.length > 1) fail('plusieurs lignes de paramètres du foyer.');
  for (const h of data.householdSettings) {
    if (h.id !== HOUSEHOLD_SETTINGS_ID) fail('paramètres du foyer invalides.');
    if (h.referenceRate !== null && typeof h.referenceRate !== 'number') {
      fail('taux du placement de référence invalide.');
    }
  }
  const budgetKeys = new Set<string>();
  for (const b of data.budgets) {
    if (!Number.isInteger(b.year) || !isRow(b.planned)) fail('budget invalide.');
    const key = `${b.propertyId}#${b.year}`;
    if (budgetKeys.has(key)) fail(`budget ${b.year} en double.`);
    budgetKeys.add(key);
    for (const [line, amount] of Object.entries(b.planned)) {
      if (!(BUDGET_LINES as readonly string[]).includes(line) || !isCents(amount)) {
        fail(`montant invalide dans le budget ${b.year}.`);
      }
    }
  }
  for (const row of [
    ...data.budgets,
    ...data.assets,
    ...data.accountantCarryforwards,
    ...data.accountantFilings,
    ...data.preRentalExpenses,
    ...data.assumptions,
  ]) {
    if (!propertyIds.has(row.propertyId)) fail('une donnée renvoie à un bien inconnu.');
  }
}
