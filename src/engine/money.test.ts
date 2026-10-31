import { describe, expect, it } from 'vitest';
import { centsToEuros, eurosToCents } from './money';

describe('conversion euros / centimes', () => {
  it('arrondit au centime', () => {
    expect(eurosToCents(1054.89)).toBe(105489);
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
    expect(eurosToCents(-107.46)).toBe(-10746);
    expect(eurosToCents(0)).toBe(0);
  });

  it('reconvertit en euros', () => {
    expect(centsToEuros(105489)).toBe(1054.89);
  });
});
