import type { Cents, IsoDate, Loan, LoanInstallment } from '../types';

/**
 * Capital restant dû à une date (incluse) :
 * montant emprunté − somme du capital des échéances datées au plus tard à cette date.
 * Voir docs/regles-de-calcul.md § 2.
 */
export function outstandingPrincipal(
  loan: Loan,
  installments: readonly LoanInstallment[],
  date: IsoDate,
): Cents {
  let repaid = 0;
  for (const installment of installments) {
    if (installment.loanId === loan.id && installment.date <= date) {
      repaid += installment.principal;
    }
  }
  return loan.principal - repaid;
}
