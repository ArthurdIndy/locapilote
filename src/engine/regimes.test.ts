import { describe, expect, it } from 'vitest';
import { COMPATIBLE_TAX_REGIMES, isTaxRegimeCompatible, RENTAL_TYPES, TAX_REGIMES } from './types';

describe('compatibilité entre type de location et régime fiscal', () => {
  it('meublée ou saisonnière : régimes BIC seulement', () => {
    for (const type of ['furnished', 'seasonal'] as const) {
      expect(COMPATIBLE_TAX_REGIMES[type]).toEqual(['lmnp-micro-bic', 'lmnp-reel', 'lmp-reel']);
      expect(isTaxRegimeCompatible(type, 'micro-foncier')).toBe(false);
      expect(isTaxRegimeCompatible(type, 'reel-foncier')).toBe(false);
    }
  });

  it('nue : revenus fonciers seulement', () => {
    expect(COMPATIBLE_TAX_REGIMES.unfurnished).toEqual(['micro-foncier', 'reel-foncier']);
    expect(isTaxRegimeCompatible('unfurnished', 'lmnp-reel')).toBe(false);
  });

  it('chaque régime convient à au moins un type de location', () => {
    for (const regime of TAX_REGIMES) {
      expect(RENTAL_TYPES.some((type) => isTaxRegimeCompatible(type, regime))).toBe(true);
    }
  });
});
