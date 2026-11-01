import { addMonths, yearOf } from '../dates';
import type { Cents, IsoDate, Loan, LoanInstallment } from '../types';

/** Échéances d'un prêt, triées par numéro. */
export function installmentsOf(
  loan: Loan,
  installments: readonly LoanInstallment[],
): LoanInstallment[] {
  return installments.filter((i) => i.loanId === loan.id).sort((a, b) => a.number - b.number);
}

/** Échéance totale = capital + intérêts + assurance. */
export function installmentTotal(installment: LoanInstallment): Cents {
  return installment.principal + installment.interest + installment.insurance;
}

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

/** Date de la dernière échéance : première échéance + (durée − 1) mois. */
export function lastInstallmentDate(
  firstInstallmentDate: IsoDate,
  durationMonths: number,
): IsoDate {
  return addMonths(firstInstallmentDate, Math.max(0, durationMonths - 1));
}

/**
 * Échéancier théorique d'un prêt amortissable à mensualités constantes, quand on n'a pas
 * le tableau de la banque. C'est une estimation : la banque arrondit et date ses échéances
 * à sa façon (première échéance souvent partielle), son tableau fait foi.
 *
 * mensualité hors assurance = M × t / (1 − (1 + t)^−n), avec t = taux annuel / 12 ;
 * intérêts du mois = capital dû × t (arrondi au centime) ; capital = mensualité − intérêts ;
 * la dernière échéance solde le capital restant ; assurance = assurance mensuelle du prêt.
 */
export function generateEstimatedSchedule(loan: Loan): LoanInstallment[] {
  const n = loan.durationMonths;
  if (!Number.isInteger(n) || n <= 0 || loan.principal <= 0) return [];
  const rate = loan.annualRate / 12;
  const payment =
    rate === 0 ? loan.principal / n : (loan.principal * rate) / (1 - Math.pow(1 + rate, -n));

  const schedule: LoanInstallment[] = [];
  let remaining = loan.principal;
  for (let k = 0; k < n; k++) {
    const interest = Math.round(remaining * rate);
    const isLast = k === n - 1;
    const principal = isLast ? remaining : Math.min(remaining, Math.round(payment) - interest);
    schedule.push({
      loanId: loan.id,
      number: k + 1,
      date: addMonths(loan.firstInstallmentDate, k),
      principalBefore: remaining,
      principal,
      interest,
      insurance: loan.monthlyInsurance,
    });
    remaining -= principal;
  }
  return schedule;
}

export interface LoanYear {
  year: number;
  count: number;
  principal: Cents;
  interest: Cents;
  insurance: Cents;
  total: Cents;
  /** Capital restant dû au 31/12 de l'année. */
  outstandingAtYearEnd: Cents;
}

/** Capital, intérêts et assurance par année civile, avec le capital restant dû au 31/12. */
export function loanYears(loan: Loan, installments: readonly LoanInstallment[]): LoanYear[] {
  const byYear = new Map<number, LoanYear>();
  for (const i of installmentsOf(loan, installments)) {
    const year = yearOf(i.date);
    let row = byYear.get(year);
    if (!row) {
      row = {
        year,
        count: 0,
        principal: 0,
        interest: 0,
        insurance: 0,
        total: 0,
        outstandingAtYearEnd: 0,
      };
      byYear.set(year, row);
    }
    row.count += 1;
    row.principal += i.principal;
    row.interest += i.interest;
    row.insurance += i.insurance;
    row.total += installmentTotal(i);
  }
  const years = [...byYear.values()].sort((a, b) => a.year - b.year);
  for (const row of years) {
    row.outstandingAtYearEnd = outstandingPrincipal(loan, installments, `${row.year}-12-31`);
  }
  return years;
}

export interface LoanTotals {
  principal: Cents;
  interest: Cents;
  insurance: Cents;
  total: Cents;
}

/** Somme des échéances d'un ou plusieurs prêts qui vérifient un critère. */
export function sumInstallments(
  installments: readonly LoanInstallment[],
  keep: (i: LoanInstallment) => boolean,
): LoanTotals {
  const totals: LoanTotals = { principal: 0, interest: 0, insurance: 0, total: 0 };
  for (const i of installments) {
    if (!keep(i)) continue;
    totals.principal += i.principal;
    totals.interest += i.interest;
    totals.insurance += i.insurance;
    totals.total += installmentTotal(i);
  }
  return totals;
}
