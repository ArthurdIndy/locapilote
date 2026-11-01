import { describe, expect, it } from 'vitest';
import { installmentsOf } from '../engine/core/loan';
import { loadTestDataset } from '../db/testDataset';
import { loanInsurance } from './loanInsurance';

const data = loadTestDataset();
const installments = installmentsOf(data.loans[0]!, data.loanInstallments);

describe('assurance emprunteur variable (jeu de test)', () => {
  it('au 01/11/2026 : 20,08 € par mois, puis 11,27 € à partir de décembre 2032', () => {
    expect(loanInsurance(installments, '2026-11-01')).toEqual({
      current: 2008,
      upcomingChanges: [{ date: '2032-12-05', insurance: 1127 }],
    });
  });

  it('avant la première échéance : celle de la première échéance', () => {
    expect(loanInsurance(installments, '2017-01-01')).toEqual({
      current: 1875,
      upcomingChanges: [
        { date: '2018-01-05', insurance: 2008 },
        { date: '2032-12-05', insurance: 1127 },
      ],
    });
  });

  it('après le changement : plus de changement à venir', () => {
    expect(loanInsurance(installments, '2033-01-10')).toEqual({
      current: 1127,
      upcomingChanges: [],
    });
  });

  it('sans échéancier : rien', () => {
    expect(loanInsurance([], '2026-11-01')).toBeNull();
  });
});
