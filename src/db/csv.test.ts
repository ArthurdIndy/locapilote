import { describe, expect, it } from 'vitest';
import { centsToFrenchNumber, transactionsToCsv, UTF8_BOM } from './csv';
import { loadTestDataset } from './testDataset';

describe('export CSV des mouvements', () => {
  it('écrit les montants au format français', () => {
    expect(centsToFrenchNumber(105489)).toBe('1054,89');
    expect(centsToFrenchNumber(-10746)).toBe('-107,46');
    expect(centsToFrenchNumber(5)).toBe('0,05');
    expect(centsToFrenchNumber(0)).toBe('0,00');
  });

  it('produit un fichier lisible par Excel', () => {
    const csv = transactionsToCsv(loadTestDataset());
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Date;Bien;Compte;Catégorie;Sens;Libellé;Montant;Pièce;Source;Commentaire',
    );
    // 289 mouvements + l'en-tête + la ligne vide finale.
    expect(lines).toHaveLength(291);
    expect(lines[1]?.startsWith('14/05/2024;Appartement exemple;Agence;')).toBe(true);
  });

  it('protège les cellules contenant un point-virgule, un guillemet ou un retour à la ligne', () => {
    const data = loadTestDataset();
    data.transactions = [{ ...data.transactions[0]!, label: 'A ; B "C"', comment: 'x\ny' }];
    const line = transactionsToCsv(data).slice(1).split('\r\n').slice(1).join('\r\n');
    expect(line).toContain('"A ; B ""C"""');
    expect(line).toContain('"x\ny"');
  });
});
