import 'fake-indexeddb/auto';
import Dexie from 'dexie';
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
    accountantFilings: by((f: Dataset['accountantFilings'][number]) => `${f.propertyId}#${f.year}`)(
      data.accountantFilings,
    ),
    preRentalExpenses: data.preRentalExpenses,
    assumptions: by((a: Dataset['assumptions'][number]) => a.propertyId)(data.assumptions),
    householdSettings: data.householdSettings,
    budgets: by((b: Dataset['budgets'][number]) => `${b.propertyId}#${b.year}`)(data.budgets),
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
    // Un budget modifié (US12).
    await db.saveBudgetLine('APPART-01', 2026, 'coOwnership', 250000);
    // Et le placement de référence (paramètre du foyer, US11).
    await db.saveHouseholdSettings({
      id: 'household',
      referenceRate: 0.035,
      referenceLabel: 'Fonds euros',
    });
    const before = await db.readAll();
    expect(before.householdSettings).toHaveLength(1);
    expect(before.budgets).toEqual([
      { propertyId: 'APPART-01', year: 2026, planned: { coOwnership: 250000 } },
    ]);
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

  it('refuse un bien dont le régime ne correspond pas au type de location', () => {
    const backup = buildBackup(loadTestDataset());
    backup.data.properties[0]!.taxRegime = 'micro-foncier';
    expect(() => parseBackup(serializeBackup(backup))).toThrow(/pas compatible/);
  });

  it('lit une sauvegarde de la version 1 (avant les identifiants d’immobilisation)', () => {
    const v1 = JSON.parse(serializeBackup(buildBackup(loadTestDataset())));
    v1.formatVersion = 1;
    delete v1.data.accountantFilings;
    for (const a of v1.data.assets) delete a.id;
    const { data } = parseBackup(JSON.stringify(v1));
    expect(data.accountantFilings).toEqual([]);
    expect(new Set(data.assets.map((a) => a.id)).size).toBe(5);
  });

  it('lit une sauvegarde de la version 2 (avant les paramètres du foyer)', () => {
    const v2 = JSON.parse(serializeBackup(buildBackup(loadTestDataset())));
    v2.formatVersion = 2;
    delete v2.data.householdSettings;
    expect(parseBackup(JSON.stringify(v2)).data.householdSettings).toEqual([]);
  });

  it('lit une sauvegarde de la version 4 (avant les budgets)', () => {
    const v4 = JSON.parse(serializeBackup(buildBackup(loadTestDataset())));
    v4.formatVersion = 4;
    delete v4.data.budgets;
    expect(parseBackup(JSON.stringify(v4)).data.budgets).toEqual([]);
  });

  it('refuse un budget invalide', () => {
    const backup = buildBackup(loadTestDataset());
    backup.data.budgets = [{ propertyId: 'APPART-01', year: 2026, planned: { coOwnership: 12.5 } }];
    expect(() => parseBackup(serializeBackup(backup))).toThrow(/budget 2026/);
    backup.data.budgets = [{ propertyId: 'inconnu', year: 2026, planned: {} }];
    expect(() => parseBackup(serializeBackup(backup))).toThrow(/bien inconnu/);
  });

  it('refuse une sauvegarde d’une version future', () => {
    const backup = { ...buildBackup(loadTestDataset()), formatVersion: 99 };
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/plus récente/);
  });
});

describe('hypothèses de simulation (US11)', () => {
  it('enregistre les scénarios de vente d’un bien, et refuse un bien inconnu', async () => {
    await startWithTestDataset(db);
    const [assumptions] = await db.assumptions.toArray();
    await db.saveAssumptions({
      ...assumptions!,
      saleScenarios: [{ date: '2030-06-30', price: 30000000 }],
    });
    expect((await db.assumptions.get('APPART-01'))!.saleScenarios).toEqual([
      { date: '2030-06-30', price: 30000000 },
    ]);
    await expect(db.saveAssumptions({ ...assumptions!, propertyId: 'inconnu' })).rejects.toThrow(
      /Bien/,
    );
  });
});

describe('budget (US12)', () => {
  it('enregistre une valeur modifiée par bien et par année, et le retour au calcul', async () => {
    await startWithTestDataset(db);
    await db.saveBudgetLine('APPART-01', 2026, 'coOwnership', 250000);
    await db.saveBudgetLine('APPART-01', 2026, 'taxes', 60000);
    await db.saveBudgetLine('APPART-01', 2027, 'coOwnership', 270000);
    expect(await db.budgets.get(['APPART-01', 2026])).toEqual({
      propertyId: 'APPART-01',
      year: 2026,
      planned: { coOwnership: 250000, taxes: 60000 },
    });
    // Retour au calcul automatique : la ligne disparaît, l'année 2027 ne bouge pas.
    await db.saveBudgetLine('APPART-01', 2026, 'coOwnership', null);
    expect((await db.budgets.get(['APPART-01', 2026]))!.planned).toEqual({ taxes: 60000 });
    await db.saveBudgetLine('APPART-01', 2026, 'taxes', null);
    expect(await db.budgets.get(['APPART-01', 2026])).toBeUndefined();
    expect((await db.budgets.get(['APPART-01', 2027]))!.planned).toEqual({ coOwnership: 270000 });
    await expect(db.saveBudgetLine('inconnu', 2026, 'taxes', 1)).rejects.toThrow(/Bien/);
  });
});

describe('valeurs de projection (Paramètres de vente)', () => {
  it('deux modifications rapprochées ne s’écrasent pas', async () => {
    await startWithTestDataset(db);
    await Promise.all([
      db.saveProjection('APPART-01', { netRentMonthly: null }),
      db.saveProjection('APPART-01', { annualExpensesExcludingLoan: null }),
    ]);
    const { projection } = (await db.assumptions.get('APPART-01'))!;
    expect(projection.netRentMonthly).toBeNull();
    expect(projection.annualExpensesExcludingLoan).toBeNull();
    expect(projection.annualGrowth).toBe(0.015);
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

describe('migration de la base vers la version 5 (US12)', () => {
  it('ajoute la table des budgets, vide, sans toucher aux données', async () => {
    const name = `test-${n}-v4`;
    const old = new Dexie(name);
    old.version(4).stores({
      properties: 'id',
      categories: 'id',
      transactions: 'id, propertyId, date, categoryId',
      loans: 'id, propertyId',
      loanInstallments: '[loanId+number], loanId',
      assets: '++, propertyId, id',
      accountantCarryforwards: '[propertyId+year], propertyId',
      accountantFilings: '[propertyId+year], propertyId',
      preRentalExpenses: '++, propertyId',
      assumptions: 'propertyId',
      householdSettings: 'id',
    });
    const data = loadTestDataset();
    await old.table('properties').bulkAdd(data.properties);
    await old.table('transactions').bulkAdd(data.transactions);
    await old.table('assumptions').bulkAdd(data.assumptions);
    old.close();

    const upgraded = new LocapiloteDb(name);
    const after = await upgraded.readAll();
    expect(upgraded.verno).toBe(5);
    expect(after.budgets).toEqual([]);
    expect(after.transactions).toHaveLength(289);
    expect(after.assumptions).toEqual(data.assumptions);
    await upgraded.saveBudgetLine('APPART-01', 2026, 'income', 1400000);
    expect(await upgraded.budgets.count()).toBe(1);
    await upgraded.delete();
  });
});

describe('migration de la base vers la version 4 (US11 recentrée)', () => {
  it('reprend les hypothèses saisies et reporte les frais d’acquisition sur le bien', async () => {
    const name = `test-${n}-v3`;
    const old = new Dexie(name);
    old.version(3).stores({
      properties: 'id',
      categories: 'id',
      transactions: 'id, propertyId, date, categoryId',
      loans: 'id, propertyId',
      loanInstallments: '[loanId+number], loanId',
      assets: '++, propertyId, id',
      accountantCarryforwards: '[propertyId+year], propertyId',
      accountantFilings: '[propertyId+year], propertyId',
      preRentalExpenses: '++, propertyId',
      assumptions: 'propertyId',
      householdSettings: 'id',
    });
    const property = { ...loadTestDataset().properties[0]! };
    delete property.actualAcquisitionCosts;
    await old.table('properties').add(property);
    await old.table('assumptions').add({
      propertyId: property.id,
      sale: {
        agencyFeesRate: 0,
        otherSaleCosts: 167400,
        earlyRepaymentPenalty: 0,
        actualAcquisitionCosts: 2790000,
        incomeTaxRate: 0.19,
        socialChargesRate: 0.172,
      },
      projection: {
        avoidedRentMonthlyAtPurchase: 0,
        avoidedRentIndexation: 0,
        netRentMonthly: 0,
        annualExpensesExcludingLoan: 0,
        annualGrowth: 0,
        depreciationDeductedPerYear: 418500,
        saleYearCosts: 0,
        mainResidenceReinvestedShare: 0,
        otherDebts: 0,
      },
      saleScenarios: [],
      dataAsOf: '',
    });
    old.close();

    const upgraded = new LocapiloteDb(name);
    const a = (await upgraded.assumptions.get(property.id))!;
    expect(a.sale).toEqual({ agencyFeesRate: 0, otherSaleCosts: 167400, earlyRepaymentPenalty: 0 });
    expect(a.projection.depreciationDeductedPerYear).toBe(418500);
    expect(a.projection.netRentMonthly).toBeNull();
    expect((await upgraded.properties.get(property.id))!.actualAcquisitionCosts).toBe(2790000);
    await upgraded.delete();
  });
});
