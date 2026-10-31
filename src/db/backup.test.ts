import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Dataset } from '../engine/types';
import { BackupError, buildBackup, parseBackup, serializeBackup } from './backup';
import { LocapiloteDb } from './database';
import { startEmpty, startWithTestDataset } from './setup';
import { loadTestDataset } from './testDataset';

let db: LocapiloteDb;
let n = 0;

beforeEach(() => {
  n += 1;
  db = new LocapiloteDb(`test-${n}`);
});

afterEach(async () => {
  await db.delete();
});

/** Trie chaque liste pour comparer deux jeux de données sans dépendre de l'ordre de stockage. */
function normalize(data: Dataset): Dataset {
  const by =
    <T>(key: (row: T) => string) =>
    (rows: T[]) =>
      [...rows].sort((a, b) => key(a).localeCompare(key(b)));
  return {
    properties: by((p: Dataset['properties'][number]) => p.id)(data.properties),
    categories: by((c: Dataset['categories'][number]) => c.id)(data.categories),
    transactions: by((t: Dataset['transactions'][number]) => t.id)(data.transactions),
    loans: by((l: Dataset['loans'][number]) => l.id)(data.loans),
    loanInstallments: by(
      (e: Dataset['loanInstallments'][number]) =>
        `${e.loanId}#${String(e.number).padStart(6, '0')}`,
    )(data.loanInstallments),
    assets: data.assets,
    accountantCarryforwards: by(
      (s: Dataset['accountantCarryforwards'][number]) => `${s.propertyId}#${s.year}`,
    )(data.accountantCarryforwards),
    preRentalExpenses: data.preRentalExpenses,
    assumptions: by((a: Dataset['assumptions'][number]) => a.propertyId)(data.assumptions),
  };
}

describe('sauvegarde complète (US18)', () => {
  it('stocke le jeu de test sans perte', async () => {
    await startWithTestDataset(db);
    expect(normalize(await db.readAll())).toEqual(normalize(loadTestDataset()));
  });

  it('un export suivi d’un import redonne exactement les mêmes données', async () => {
    await startWithTestDataset(db);
    // On ajoute un mouvement saisi à la main, avec des champs facultatifs vides.
    await db.saveTransaction({
      id: 'saisie-1',
      propertyId: 'APPART-01',
      date: '2026-10-31',
      account: 'Banque',
      categoryId: 'Taxe foncière',
      label: 'Taxe foncière 2026 ; « test »',
      amount: 123456,
      document: null,
      source: null,
      comment: 'Ligne 1\nLigne 2',
    });
    const before = await db.readAll();
    const file = serializeBackup(buildBackup(before, new Date('2026-10-31T12:00:00Z')));

    // Import dans une autre base, qui contenait déjà d'autres données.
    const other = new LocapiloteDb(`test-${n}-import`);
    await startEmpty(other);
    await other.replaceAll(parseBackup(file).data);
    const after = await other.readAll();
    await other.delete();

    expect(after).toEqual(before);
    expect(after.transactions).toHaveLength(290);
    // Et un second export est identique au premier, caractère pour caractère.
    expect(serializeBackup(buildBackup(after, new Date('2026-10-31T12:00:00Z')))).toBe(file);
  });

  it('remplace tout lors de l’import', async () => {
    await startWithTestDataset(db);
    const empty = new LocapiloteDb(`test-${n}-vide`);
    await startEmpty(empty);
    const file = serializeBackup(buildBackup(await empty.readAll()));
    await empty.delete();

    await db.replaceAll(parseBackup(file).data);
    const data = await db.readAll();
    expect(data.properties).toHaveLength(0);
    expect(data.transactions).toHaveLength(0);
    expect(data.loanInstallments).toHaveLength(0);
    expect(data.categories).toHaveLength(24);
  });

  it('refuse un fichier qui n’est pas une sauvegarde Locapilote', () => {
    expect(() => parseBackup('pas du json')).toThrow(BackupError);
    expect(() => parseBackup('{"application":"autre","data":{}}')).toThrow(/pas une sauvegarde/);
  });

  it('refuse une sauvegarde incohérente', () => {
    const backup = buildBackup(loadTestDataset());
    backup.data.transactions[0]!.categoryId = 'Catégorie fantôme';
    expect(() => parseBackup(serializeBackup(backup))).toThrow(/catégorie inconnue/);

    const incomplete = JSON.parse(serializeBackup(buildBackup(loadTestDataset())));
    delete incomplete.data.loans;
    expect(() => parseBackup(JSON.stringify(incomplete))).toThrow(/« loans »/);
  });

  it('refuse une sauvegarde d’une version future', () => {
    const backup = { ...buildBackup(loadTestDataset()), formatVersion: 99 };
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/plus récente/);
  });
});

describe('enregistrement d’un mouvement', () => {
  it('refuse un bien ou une catégorie inconnus', async () => {
    await startWithTestDataset(db);
    const base = {
      id: 'x',
      propertyId: 'APPART-01',
      date: '2026-10-31',
      account: 'Banque',
      categoryId: 'CFE',
      label: '',
      amount: 100,
      document: null,
      source: null,
      comment: null,
    };
    await expect(db.saveTransaction({ ...base, propertyId: 'inconnu' })).rejects.toThrow(/Bien/);
    await expect(db.saveTransaction({ ...base, categoryId: 'inconnue' })).rejects.toThrow(
      /Catégorie/,
    );
  });
});
