import { describe, expect, it } from 'vitest';
import { loadTestDataset } from '../../db/testDataset';
import { expectedSynthesisLine } from '../../test/expected';
import { centsToEuros } from '../money';
import type { Loan, LoanInstallment } from '../types';
import { outstandingPrincipal } from './loan';

const dataset = loadTestDataset();
const loan = dataset.loans[0]!;

describe('capital restant dû', () => {
  const expected = expectedSynthesisLine('Capital restant dû au 31/12');

  it.each([2024, 2025, 2026])('au 31/12/%i, retrouve expected.json', (year) => {
    const value = outstandingPrincipal(loan, dataset.loanInstallments, `${year}-12-31`);
    expect(centsToEuros(value)).toBeCloseTo(expected[String(year)]!, 2);
  });

  it('vaut le montant emprunté avant la première échéance', () => {
    expect(outstandingPrincipal(loan, dataset.loanInstallments, '2017-12-04')).toBe(17019000);
  });

  it("inclut l'échéance tombant le jour même", () => {
    const before = outstandingPrincipal(loan, dataset.loanInstallments, '2017-12-04');
    const onDay = outstandingPrincipal(loan, dataset.loanInstallments, '2017-12-05');
    expect(before - onDay).toBe(60851);
  });

  it("n'utilise que les échéances du prêt demandé", () => {
    const other: Loan = { ...loan, id: 'P2', principal: 100000 };
    const installments: LoanInstallment[] = [
      ...dataset.loanInstallments,
      {
        loanId: 'P2',
        number: 1,
        date: '2020-01-01',
        principalBefore: 100000,
        principal: 40000,
        interest: 0,
        insurance: 0,
      },
    ];
    expect(outstandingPrincipal(other, installments, '2030-01-01')).toBe(60000);
    expect(outstandingPrincipal(loan, installments, '2024-12-31')).toBe(11565493);
  });
});
