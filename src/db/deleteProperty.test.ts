import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Dataset, Property } from '../engine/types';
import { LocapiloteDb } from './database';
import { defaultCategories } from './defaultCategories';
import { loadTestDataset } from './testDataset';

let db: LocapiloteDb;
let n = 0;

beforeEach(() => {
  n += 1;
  db = new LocapiloteDb(`test-delete-${n}`);
});

afterEach(async () => {
  await db.delete();
});

/**
 * Deux biens : celui du jeu de test (APPART-01), et une copie complète (B2), avec ses propres
 * opérations, prêt, échéances, immobilisations, hypothèses, budgets et données fiscales.
 */
function twoProperties(): Dataset {
  const data = loadTestDataset();
  const copyId = 'B2';
  const loanIds = new Map(data.loans.map((l) => [l.id, `${l.id}-B2`]));
  return {
    ...data,
    properties: [...data.properties, { ...data.properties[0]!, id: copyId, name: 'Copie' }],
    transactions: [
      ...data.transactions,
      ...data.transactions.map((t) => ({ ...t, id: `${t.id}-B2`, propertyId: copyId })),
    ],
    loans: [
      ...data.loans,
      ...data.loans.map((l) => ({ ...l, id: loanIds.get(l.id)!, propertyId: copyId })),
    ],
    loanInstallments: [
      ...data.loanInstallments,
      ...data.loanInstallments.map((i) => ({ ...i, loanId: loanIds.get(i.loanId)! })),
    ],
    assets: [
      ...data.assets,
      ...data.assets.map((a) => ({ ...a, id: `${a.id}-B2`, propertyId: copyId })),
    ],
    accountantCarryforwards: [
      ...data.accountantCarryforwards,
      ...data.accountantCarryforwards.map((c) => ({ ...c, propertyId: copyId })),
    ],
    accountantFilings: [
      ...data.accountantFilings,
      ...data.accountantFilings.map((f) => ({ ...f, propertyId: copyId })),
    ],
    preRentalExpenses: [
      ...data.preRentalExpenses,
      ...data.preRentalExpenses.map((e) => ({ ...e, propertyId: copyId })),
    ],
    assumptions: [
      ...data.assumptions,
      ...data.assumptions.map((a) => ({ ...a, propertyId: copyId })),
    ],
    budgets: [
      { propertyId: 'APPART-01', year: 2026, planned: { income: 1400000 } },
      { propertyId: copyId, year: 2026, planned: { income: 1500000 } },
    ],
  };
}

/** Lignes de chaque table qui renvoient à un bien (directement, ou via leur prêt). */
function rowsOf(data: Dataset, propertyId: string): number {
  const loanIds = new Set(data.loans.filter((l) => l.propertyId === propertyId).map((l) => l.id));
  const tables = [
    data.transactions,
    data.loans,
    data.assets,
    data.accountantCarryforwards,
    data.accountantFilings,
    data.preRentalExpenses,
    data.assumptions,
    data.budgets,
  ] as readonly { propertyId: string }[][];
  return (
    tables.reduce((sum, rows) => sum + rows.filter((r) => r.propertyId === propertyId).length, 0) +
    data.loanInstallments.filter((i) => loanIds.has(i.loanId)).length
  );
}

describe('suppression d’un bien (itération 5a)', () => {
  it('supprime tout ce qui le concerne, sans donnée orpheline, et laisse l’autre bien intact', async () => {
    const data = twoProperties();
    await db.replaceAll(data);
    const before = await db.readAll();
    expect(rowsOf(before, 'APPART-01')).toBeGreaterThan(0);

    await db.deleteProperty('APPART-01');
    const after = await db.readAll();

    // Plus rien du bien supprimé, dans aucune table.
    expect(after.properties.map((p) => p.id)).toEqual(['B2']);
    expect(rowsOf(after, 'APPART-01')).toBe(0);
    // Aucune échéance orpheline (prêt disparu) ni ligne rattachée à un bien inconnu.
    const loanIds = new Set(after.loans.map((l) => l.id));
    expect(after.loanInstallments.every((i) => loanIds.has(i.loanId))).toBe(true);
    const propertyIds = new Set(after.properties.map((p) => p.id));
    for (const rows of [
      after.transactions,
      after.loans,
      after.assets,
      after.accountantCarryforwards,
      after.accountantFilings,
      after.preRentalExpenses,
      after.assumptions,
      after.budgets,
    ] as readonly { propertyId: string }[][]) {
      expect(rows.every((r) => propertyIds.has(r.propertyId))).toBe(true);
    }

    // L'autre bien est intact, ligne pour ligne.
    const keep = (d: Dataset) => ({
      transactions: d.transactions.filter((t) => t.propertyId === 'B2'),
      loans: d.loans.filter((l) => l.propertyId === 'B2'),
      installments: d.loanInstallments.filter((i) => i.loanId.endsWith('-B2')),
      assets: d.assets.filter((a) => a.propertyId === 'B2'),
      carryforwards: d.accountantCarryforwards.filter((c) => c.propertyId === 'B2'),
      filings: d.accountantFilings.filter((f) => f.propertyId === 'B2'),
      preRental: d.preRentalExpenses.filter((e) => e.propertyId === 'B2'),
      assumptions: d.assumptions.filter((a) => a.propertyId === 'B2'),
      budgets: d.budgets.filter((b) => b.propertyId === 'B2'),
    });
    expect(keep(after)).toEqual(keep(before));
    expect(rowsOf(after, 'B2')).toBe(rowsOf(before, 'B2'));

    // Les catégories et les paramètres du foyer restent.
    expect(after.categories).toEqual(before.categories);
    expect(after.householdSettings).toEqual(before.householdSettings);
  });

  it('supprimer le dernier bien laisse les catégories, et aucune autre donnée', async () => {
    await db.replaceAll(loadTestDataset());
    await db.deleteProperty('APPART-01');
    const after = await db.readAll();
    expect(after.categories.length).toBeGreaterThan(0);
    expect(after.properties).toEqual([]);
    expect(after.transactions).toEqual([]);
    expect(after.loans).toEqual([]);
    expect(after.loanInstallments).toEqual([]);
    expect(after.assets).toEqual([]);
    expect(after.accountantCarryforwards).toEqual([]);
    expect(after.accountantFilings).toEqual([]);
    expect(after.preRentalExpenses).toEqual([]);
    expect(after.assumptions).toEqual([]);
    expect(after.budgets).toEqual([]);
  });
});

describe('création d’un bien', () => {
  const property: Property = { ...loadTestDataset().properties[0]!, id: 'N1', name: 'Neuf' };

  it('dans un navigateur vide, ajoute les catégories par défaut', async () => {
    await db.createProperty(property);
    expect(await db.properties.count()).toBe(1);
    expect(await db.categories.count()).toBe(defaultCategories().length);
  });

  it('ne touche pas aux catégories existantes', async () => {
    await db.replaceAll(loadTestDataset());
    await db.categories.delete('CFE');
    const count = await db.categories.count();
    await db.createProperty(property);
    expect(await db.categories.count()).toBe(count);
    expect(await db.properties.count()).toBe(2);
  });
});
