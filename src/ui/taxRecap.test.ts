import { describe, expect, it } from 'vitest';
import { UTF8_BOM } from '../db/csv';
import { loadTestDataset } from '../db/testDataset';
import { lmnpReelSummary } from '../engine/tax/lmnp-reel';
import { recapToCsv } from './taxRecap';

const data = loadTestDataset();
const property = data.properties[0]!;
const years = lmnpReelSummary(data, property, '2026-10-25');

describe('export CSV du récapitulatif LMNP réel', () => {
  const csv = recapToCsv(property, years, '2026-10-25');
  const lines = csv.slice(UTF8_BOM.length).split('\r\n');

  it('une colonne par année, lisible dans Excel en français', () => {
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(lines).toContain('Rubrique;2024;2025;2026');
    expect(lines).toContain('Données à jour au 25/10/2026');
  });

  it('reprend les montants du récapitulatif', () => {
    expect(lines).toContain('Total des recettes imposables;8366,76;13703,15;11432,62');
    expect(lines).toContain('Résultat avant amortissements;3639,90;6682,80;2697,43');
    expect(lines).toContain('Stock reporté retenu par le comptable;1834,69;3824,30;');
    expect(lines).toContain('Dépenses à qualifier (non retenues);395,25;0,00;0,00');
  });
});
