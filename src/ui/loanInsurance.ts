import type { Cents, IsoDate, LoanInstallment } from '../engine/types';

export interface InsuranceChange {
  /** Date de la première échéance au nouveau montant. */
  date: IsoDate;
  insurance: Cents;
}

export interface LoanInsurance {
  /** Assurance de l'échéance en cours : la dernière payée à la date donnée (ou la première à venir). */
  current: Cents;
  /** Changements de montant à venir, dans l'ordre (la date est celle de l'échéance concernée). */
  upcomingChanges: InsuranceChange[];
}

/**
 * Assurance emprunteur lue dans l'échéancier (il fait foi) : elle peut changer en cours de
 * prêt. `installments` : les échéances d'un prêt, triées. `null` sans échéancier.
 */
export function loanInsurance(
  installments: readonly LoanInstallment[],
  at: IsoDate,
): LoanInsurance | null {
  if (installments.length === 0) return null;
  const paid = installments.filter((i) => i.date <= at);
  const current = (paid.at(-1) ?? installments[0]!).insurance;
  const upcomingChanges: InsuranceChange[] = [];
  let previous = current;
  for (const i of installments) {
    if (i.date <= at || i.insurance === previous) continue;
    upcomingChanges.push({ date: i.date, insurance: i.insurance });
    previous = i.insurance;
  }
  return { current, upcomingChanges };
}
