import { describe, expect, it } from 'vitest';
import { loadTestDataset } from './testDataset';
import { parseSeed, type RawSeed } from './seed';
import seed from '../../data/seed.json';

describe('chargement du jeu de test', () => {
  const dataset = loadTestDataset();

  it('contient 1 bien, 289 mouvements et 240 échéances', () => {
    expect(dataset.properties).toHaveLength(1);
    expect(dataset.transactions).toHaveLength(289);
    expect(dataset.loanInstallments).toHaveLength(240);
  });

  it('rattache toutes les données au bien', () => {
    const [property] = dataset.properties;
    expect(property?.id).toBe('APPART-01');
    expect(property?.taxRegime).toBe('lmnp-reel');
    expect(property?.rentalType).toBe('furnished');
    for (const t of dataset.transactions) expect(t.propertyId).toBe('APPART-01');
    for (const l of dataset.loans) expect(l.propertyId).toBe('APPART-01');
  });

  it('convertit les montants en centimes entiers', () => {
    const [property] = dataset.properties;
    expect(property?.rentExcludingCharges).toBe(105489);
    expect(dataset.loans[0]?.principal).toBe(17019000);
    for (const t of dataset.transactions) expect(Number.isInteger(t.amount)).toBe(true);
    for (const e of dataset.loanInstallments) {
      expect(Number.isInteger(e.principal)).toBe(true);
      expect(Number.isInteger(e.interest)).toBe(true);
      expect(Number.isInteger(e.insurance)).toBe(true);
    }
  });

  it('garde les remises en montant négatif', () => {
    const negatives = dataset.transactions.filter((t) => t.amount < 0);
    expect(negatives.map((t) => t.amount)).toEqual([-10746, -62370]);
  });

  it('refuse une catégorie inconnue', () => {
    const raw = structuredClone(seed) as RawSeed;
    raw.mouvements[0]!.categorie = 'Catégorie fantôme';
    expect(() => parseSeed(raw)).toThrow(/catégorie inconnue/);
  });
});
