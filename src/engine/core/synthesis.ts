/**
 * Synthèse annuelle d'un bien : trésorerie et rentabilité (socle commun, indépendant du
 * régime fiscal). Voir docs/regles-de-calcul.md § 2 et § 3.
 *
 * Le résultat fiscal (LMNP réel : charges déductibles, amortissements, report) est calculé par
 * le module du régime du bien, dans `src/engine/tax/` (`lmnp-reel.ts`).
 */
import { daysBetween, endOfMonth, yearOf } from '../dates';
import type { Category, Cents, Dataset, IsoDate, Property, TaxTreatment } from '../types';
import { outstandingPrincipal, sumInstallments } from './loan';

/** Le groupe de synthèse des loyers hors charges (rendement brut, loyers annualisés). */
export const RENT_GROUP = 'Loyers';

export interface YearSynthesis {
  year: number;
  /** Recettes encaissées : catégories de sens « Recette ». */
  income: Cents;
  /** Dont loyers hors charges (groupe « Loyers »). */
  rent: Cents;
  /** Dépenses payées hors prêt : catégories de sens « Dépense ». */
  expenses: Cents;
  /** Dont charges d'exploitation (hors investissements à amortir et dépenses à qualifier). */
  operatingExpenses: Cents;
  /** Échéances de prêt de la période louée, jusqu'à la date de mise à jour. */
  loanPayments: Cents;
  principalRepaid: Cents;
  loanInterest: Cents;
  loanInsurance: Cents;
  cashFlow: Cents;
  /** Mois de location sur l'année (décimal, base 365/12 jours). */
  rentalMonths: number;
  /** Cash-flow mensuel moyen, en centimes non arrondis (null si aucun mois de location). */
  monthlyCashFlow: number | null;
  /** Enrichissement = cash-flow + capital remboursé. */
  wealthGain: Cents;
  /** Loyers hors charges annualisés, en centimes non arrondis. */
  annualizedRent: number | null;
  grossYield: number | null;
  netYield: number | null;
  /** Capital restant dû au 31/12 (tous les prêts du bien, échéancier complet). */
  outstandingAtYearEnd: Cents;
  /** Valeur estimée du bien − capital restant dû au 31/12. */
  equity: Cents;
}

/**
 * Traitement fiscal de la catégorie pour le régime du bien ; à défaut, celui du LMNP réel,
 * qui sert de référence tant que les autres régimes ne sont pas paramétrés (US02).
 */
function treatmentFor(category: Category, property: Property): TaxTreatment | undefined {
  return category.taxTreatment[property.taxRegime] ?? category.taxTreatment['lmnp-reel'];
}

function isOperatingExpense(category: Category, property: Property): boolean {
  const treatment = treatmentFor(category, property);
  return treatment !== 'depreciable' && treatment !== 'to-review';
}

/**
 * Mois de location de l'année : jours de MAX(1er janvier, mise en location) à
 * MIN(31 décembre, fin du mois de la date de mise à jour), bornes incluses, / (365 / 12).
 */
export function rentalMonths(year: number, rentalStart: IsoDate | null, dataAsOf: IsoDate): number {
  if (!rentalStart) return 0;
  const from = rentalStart > `${year}-01-01` ? rentalStart : `${year}-01-01`;
  const lastDataDay = endOfMonth(dataAsOf);
  const to = lastDataDay < `${year}-12-31` ? lastDataDay : `${year}-12-31`;
  const days = daysBetween(from, to) + 1;
  return days > 0 ? days / (365 / 12) : 0;
}

/** Années affichées : de l'année de mise en location à celle de la date de mise à jour. */
export function synthesisYears(property: Property, dataAsOf: IsoDate): number[] {
  if (!property.rentalStartDate || property.rentalStartDate > dataAsOf) return [];
  const years: number[] = [];
  for (let y = yearOf(property.rentalStartDate); y <= yearOf(dataAsOf); y++) years.push(y);
  return years;
}

export function yearSynthesis(
  data: Dataset,
  property: Property,
  year: number,
  dataAsOf: IsoDate,
): YearSynthesis {
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const prefix = `${year}-`;

  let income = 0;
  let rent = 0;
  let expenses = 0;
  let operatingExpenses = 0;
  for (const t of data.transactions) {
    if (t.propertyId !== property.id || !t.date.startsWith(prefix)) continue;
    const category = categories.get(t.categoryId);
    if (!category) continue;
    if (category.direction === 'income') {
      income += t.amount;
      if (category.group === RENT_GROUP) rent += t.amount;
    } else if (category.direction === 'expense') {
      expenses += t.amount;
      if (isOperatingExpense(category, property)) operatingExpenses += t.amount;
    }
  }

  const loans = data.loans.filter((l) => l.propertyId === property.id);
  const loanIds = new Set(loans.map((l) => l.id));
  const rentalStart = property.rentalStartDate;
  const loan = sumInstallments(
    data.loanInstallments,
    (i) =>
      loanIds.has(i.loanId) &&
      i.date.startsWith(prefix) &&
      rentalStart !== null &&
      i.date >= rentalStart &&
      i.date <= dataAsOf,
  );

  const cashFlow = income - expenses - loan.total;
  const months = rentalMonths(year, rentalStart, dataAsOf);
  const cost = property.totalAcquisitionCost;
  const annualize = (cents: number) => (months > 0 ? (cents / months) * 12 : null);
  const annualizedRent = annualize(rent);
  const annualizedNet = annualize(income - operatingExpenses);
  const outstanding = loans.reduce(
    (sum, l) => sum + outstandingPrincipal(l, data.loanInstallments, `${year}-12-31`),
    0,
  );

  return {
    year,
    income,
    rent,
    expenses,
    operatingExpenses,
    loanPayments: loan.total,
    principalRepaid: loan.principal,
    loanInterest: loan.interest,
    loanInsurance: loan.insurance,
    cashFlow,
    rentalMonths: months,
    monthlyCashFlow: months > 0 ? cashFlow / months : null,
    wealthGain: cashFlow + loan.principal,
    annualizedRent,
    grossYield: annualizedRent !== null && cost > 0 ? annualizedRent / cost : null,
    netYield: annualizedNet !== null && cost > 0 ? annualizedNet / cost : null,
    outstandingAtYearEnd: outstanding,
    equity: property.estimatedValue - outstanding,
  };
}

/** Synthèse de toutes les années affichées d'un bien. */
export function propertySynthesis(
  data: Dataset,
  property: Property,
  dataAsOf: IsoDate,
): YearSynthesis[] {
  return synthesisYears(property, dataAsOf).map((y) => yearSynthesis(data, property, y, dataAsOf));
}

/** Groupes de synthèse servant aux charges de copropriété restant à la charge du propriétaire. */
export const CO_OWNERSHIP_GROUP = 'Copropriété';
export const RECHARGED_CHARGES_GROUP = 'Charges refacturées';

/** Total d'un groupe de catégories (Loyers, Copropriété…) sur une année. */
export interface GroupTotal {
  group: string;
  direction: 'income' | 'expense';
  amount: Cents;
}

/**
 * Recettes et dépenses de l'année, par groupe de synthèse des catégories paramétrées (même
 * périmètre que `income` et `expenses` de `yearSynthesis`). Tous les groupes de recette et de
 * dépense sont rendus, même à zéro, dans l'ordre des catégories : un nouveau groupe apparaît
 * sans modification du code.
 */
export function yearGroupTotals(data: Dataset, property: Property, year: number): GroupTotal[] {
  const totals = new Map<string, GroupTotal>();
  const keyOf = (direction: string, group: string) => `${direction}\u0000${group}`;
  for (const c of data.categories) {
    if (c.direction !== 'income' && c.direction !== 'expense') continue;
    const key = keyOf(c.direction, c.group);
    if (!totals.has(key)) totals.set(key, { group: c.group, direction: c.direction, amount: 0 });
  }
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const prefix = `${year}-`;
  for (const t of data.transactions) {
    if (t.propertyId !== property.id || !t.date.startsWith(prefix)) continue;
    const category = categories.get(t.categoryId);
    if (!category) continue;
    const total = totals.get(keyOf(category.direction, category.group));
    if (total) total.amount += t.amount;
  }
  return [...totals.values()];
}

/**
 * Charges de copropriété restant à la charge du propriétaire : charges de copropriété payées
 * − charges refacturées au locataire.
 */
export function coOwnershipChargesBorne(groups: readonly GroupTotal[]): Cents {
  const amount = (direction: GroupTotal['direction'], group: string) =>
    groups.find((g) => g.direction === direction && g.group === group)?.amount ?? 0;
  return amount('expense', CO_OWNERSHIP_GROUP) - amount('income', RECHARGED_CHARGES_GROUP);
}
