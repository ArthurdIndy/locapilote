import { describe, expect, it } from 'vitest';
import { loadTestDataset } from '../db/testDataset';
import { describeAllData, describePropertyDeletion, propertyFootprint } from './dataSummary';

describe('confirmations : compteurs réels', () => {
  it('suppression du bien de l’exemple', () => {
    const data = loadTestDataset();
    expect(describePropertyDeletion(propertyFootprint(data, 'APPART-01'))).toBe(
      'Tout ce qui le concerne sera supprimé\u00a0: 289 opérations, 1 prêt et ses 240 échéances, ' +
        '5 immobilisations, les scénarios de vente et les données fiscales. C’est définitif.',
    );
  });

  it('une partie absente n’est pas citée ; singulier et pluriel', () => {
    const empty = {
      transactions: 0,
      loans: 0,
      installments: 0,
      assets: 0,
      budgets: 0,
      saleScenarios: 0,
      taxData: 0,
    };
    expect(describePropertyDeletion(empty)).toBe('Le bien sera supprimé. C’est définitif.');
    expect(describePropertyDeletion({ ...empty, transactions: 1, assets: 1 })).toBe(
      'Tout ce qui le concerne sera supprimé\u00a0: 1 opération et 1 immobilisation. C’est définitif.',
    );
    expect(describePropertyDeletion({ ...empty, loans: 1 })).toBe(
      'Tout ce qui le concerne sera supprimé\u00a0: 1 prêt. C’est définitif.',
    );
    expect(describePropertyDeletion({ ...empty, loans: 2, installments: 480, budgets: 1 })).toBe(
      'Tout ce qui le concerne sera supprimé\u00a0: 2 prêts et leurs 480 échéances et les budgets. C’est définitif.',
    );
  });

  it('toutes les données, tous biens confondus', () => {
    expect(describeAllData(loadTestDataset())).toBe('1 bien, 289 opérations, 240 échéances');
  });
});
