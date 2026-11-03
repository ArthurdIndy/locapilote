/**
 * Bilan depuis l'achat (« Vendre quand ») : flux du propriétaire mois par mois, gain total,
 * TRI, et comparaison à un placement de référence. Socle commun, indépendant du régime.
 * Voir docs/regles-de-calcul.md § 6.
 *
 * Montants en centimes. Certains flux calculés (loyer évité au prorata et indexé, projection
 * indexée) ne tombent pas sur un centime rond : ils sont gardés sans arrondi, comme l'Excel de
 * référence, et arrondis seulement à l'affichage.
 */
import { addDays, addMonths, daysBetween, fullYearsBetween, startOfMonth, yearOf } from '../dates';
import type { Cents, Dataset, IsoDate, Property } from '../types';
import { installmentTotal } from './loan';

/** Flux daté : positif = argent reçu ou économisé, négatif = argent versé. */
export interface DatedFlow {
  date: IsoDate;
  amount: number;
}

/** Flux d'un mois, daté du 15. */
export interface MonthFlow {
  monthStart: IsoDate;
  date: IsoDate;
  /** Loyer évité pendant l'occupation comme résidence principale. */
  avoidedRent: number;
  /** Échéances de prêt du mois (négatif), tous les prêts du bien. */
  loanPayments: Cents;
  /** Dépenses payées avant la location (négatif). */
  preRentalExpenses: Cents;
  /** Mouvements réels du journal jusqu'à la date de mise à jour (recettes − dépenses). */
  actualTransactions: Cents;
  /** Après la date de mise à jour : loyer net projeté − dépenses annuelles / 12, indexé. */
  projection: number;
  total: number;
}

/** Valeurs de projection (déjà résolues : saisies ou calculées automatiquement). */
export interface ProjectionValues {
  avoidedRentMonthlyAtPurchase: Cents;
  avoidedRentIndexation: number;
  netRentMonthly: number;
  annualExpensesExcludingLoan: number;
  annualGrowth: number;
  saleYearCosts: Cents;
}

export interface OwnerBalanceInput {
  data: Dataset;
  property: Property;
  projection: ProjectionValues;
  /** Date de mise à jour des données : au-delà, on projette. */
  dataAsOf: IsoDate;
  saleDate: IsoDate;
  /** Somme nette perçue à la vente (après impôt, sans exonération pour remploi). */
  netSaleProceeds: Cents;
}

export interface OwnerBalance {
  months: MonthFlow[];
  /** Tous les flux datés : apport, mois, vente. */
  flows: DatedFlow[];
  /** Gain total depuis l'achat = somme des flux. */
  totalGain: number;
  /** TRI annuel (XIRR, base 365) ; `null` s'il n'existe pas. */
  irr: number | null;
  /** Mois entre la date de mise à jour et la vente. */
  monthsUntilSale: number;
  /** Cash-flow à remettre d'ici la vente : prêt + projection, puis frais de l'année de vente. */
  cashFlowUntilSale: number;
  /** Capital remboursé entre la date de mise à jour et la vente. */
  principalRepaidUntilSale: Cents;
}

/** Montant au résultat d'un mouvement : + recette, − dépense, 0 sinon (transfert, dépôt). */
function signedAmount(direction: string, amount: Cents): Cents {
  if (direction === 'income') return amount;
  if (direction === 'expense') return -amount;
  return 0;
}

/**
 * Loyer évité du mois : loyer à l'achat indexé chaque année (années pleines depuis l'achat),
 * au prorata des jours du mois passés dans le logement (entre l'achat et la fin de la
 * résidence principale).
 */
function avoidedRent(
  monthStart: IsoDate,
  property: Property,
  projection: ProjectionValues,
): number {
  const end = property.mainResidenceEndDate;
  if (!end || monthStart >= end) return 0;
  const next = addMonths(monthStart, 1);
  const from = monthStart > property.acquisitionDate ? monthStart : property.acquisitionDate;
  const to = next < end ? next : end;
  const share = Math.max(0, daysBetween(from, to)) / daysBetween(monthStart, next);
  const years =
    monthStart < property.acquisitionDate
      ? 0
      : fullYearsBetween(property.acquisitionDate, monthStart);
  return (
    projection.avoidedRentMonthlyAtPurchase *
    Math.pow(1 + projection.avoidedRentIndexation, years) *
    share
  );
}

/**
 * Bilan depuis l'achat, pour une vente à `saleDate` : un flux par mois (daté du 15), du mois
 * d'acquisition au dernier mois dont le 15 précède la vente, plus l'apport à la date d'achat
 * et la somme nette de la vente moins les frais de l'année de la vente.
 */
export function ownerBalance(input: OwnerBalanceInput): OwnerBalance {
  const { data, property, projection, dataAsOf, saleDate } = input;
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const loanIds = new Set(data.loans.filter((l) => l.propertyId === property.id).map((l) => l.id));
  const installments = data.loanInstallments.filter((i) => loanIds.has(i.loanId));
  const preRental = data.preRentalExpenses.filter((e) => e.propertyId === property.id);
  const transactions = data.transactions.filter(
    (t) => t.propertyId === property.id && t.date <= dataAsOf,
  );
  const dataYear = yearOf(dataAsOf);
  const monthlyProjection = projection.netRentMonthly - projection.annualExpensesExcludingLoan / 12;

  const inMonth = (date: IsoDate, start: IsoDate, next: IsoDate) => date >= start && date < next;

  const months: MonthFlow[] = [];
  let monthsUntilSale = 0;
  let cashFlowUntilSale = 0;
  for (
    let monthStart = startOfMonth(property.acquisitionDate);
    addDays(monthStart, 14) <= saleDate;
    monthStart = addMonths(monthStart, 1)
  ) {
    const next = addMonths(monthStart, 1);
    let loanPayments = 0;
    for (const i of installments) {
      if (inMonth(i.date, monthStart, next)) loanPayments -= installmentTotal(i);
    }
    let preRentalExpenses = 0;
    for (const e of preRental) {
      if (inMonth(e.date, monthStart, next)) preRentalExpenses -= e.amount;
    }
    let actualTransactions = 0;
    for (const t of transactions) {
      if (!inMonth(t.date, monthStart, next)) continue;
      const category = categories.get(t.categoryId);
      if (category) actualTransactions += signedAmount(category.direction, t.amount);
    }
    const projected =
      monthStart <= dataAsOf
        ? 0
        : monthlyProjection * Math.pow(1 + projection.annualGrowth, yearOf(monthStart) - dataYear);
    const rent = avoidedRent(monthStart, property, projection);
    if (monthStart > dataAsOf) {
      monthsUntilSale += 1;
      cashFlowUntilSale += loanPayments + projected;
    }
    months.push({
      monthStart,
      date: addDays(monthStart, 14),
      avoidedRent: rent,
      loanPayments,
      preRentalExpenses,
      actualTransactions,
      projection: projected,
      total: rent + loanPayments + preRentalExpenses + actualTransactions + projected,
    });
  }
  cashFlowUntilSale -= projection.saleYearCosts;

  const flows: DatedFlow[] = [
    { date: property.acquisitionDate, amount: -property.downPayment },
    ...months.map((m) => ({ date: m.date, amount: m.total })),
    { date: saleDate, amount: input.netSaleProceeds - projection.saleYearCosts },
  ];
  const principalRepaidUntilSale = installments
    .filter((i) => i.date > dataAsOf && i.date <= saleDate)
    .reduce((sum, i) => sum + i.principal, 0);

  return {
    months,
    flows,
    totalGain: flows.reduce((sum, f) => sum + f.amount, 0),
    irr: xirr(flows),
    monthsUntilSale,
    cashFlowUntilSale,
    principalRepaidUntilSale,
  };
}

/** Valeur actuelle des flux au taux annuel `rate`, à la date du premier flux (base 365). */
function presentValue(flows: readonly DatedFlow[], rate: number): number {
  const origin = flows[0]!.date;
  return flows.reduce(
    (sum, f) => sum + f.amount / Math.pow(1 + rate, daysBetween(origin, f.date) / 365),
    0,
  );
}

/**
 * TRI de flux datés, comme XIRR dans Excel : le taux annuel qui annule la valeur actuelle des
 * flux, en base 365 jours. `null` si les flux ne changent pas de signe (pas de TRI).
 */
export function xirr(flows: readonly DatedFlow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null;
  // Recherche par dichotomie sur un intervalle large : lente mais sûre (la valeur actuelle
  // décroît avec le taux quand le premier flux est négatif et les suivants surtout positifs).
  let low = -0.9999;
  let high = 10;
  let pvLow = presentValue(flows, low);
  const pvHigh = presentValue(flows, high);
  if (Math.sign(pvLow) === Math.sign(pvHigh)) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (low + high) / 2;
    const pvMid = presentValue(flows, mid);
    if (Math.abs(pvMid) < 1e-7 || high - low < 1e-12) return mid;
    if (Math.sign(pvMid) === Math.sign(pvLow)) {
      low = mid;
      pvLow = pvMid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

/**
 * Gain par rapport à un placement de référence, en centimes, à la date `at` (la vente) :
 * valeur finale des flux du propriétaire, chacun capitalisé (ou actualisé) au taux du
 * placement jusqu'à `at`. C'est ce que le bien a rapporté de plus (ou de moins) que si les
 * mêmes sommes avaient été placées au taux de référence. Il vaut 0 quand ce taux est le TRI.
 */
export function gainOverReference(flows: readonly DatedFlow[], rate: number, at: IsoDate): number {
  return flows.reduce(
    (sum, f) => sum + f.amount * Math.pow(1 + rate, daysBetween(f.date, at) / 365),
    0,
  );
}

/**
 * Rendement annuel de l'attente entre deux scénarios de vente : gain en plus rapporté à la
 * somme nette du scénario précédent, par année d'attente. `null` si les dates ne se suivent pas.
 */
export function waitingYield(
  previous: { date: IsoDate; totalGain: number; netSaleProceeds: number },
  next: { date: IsoDate; totalGain: number },
): number | null {
  const days = daysBetween(previous.date, next.date);
  if (days <= 0 || previous.netSaleProceeds === 0) return null;
  return (next.totalGain - previous.totalGain) / previous.netSaleProceeds / (days / 365);
}

/**
 * Gain de l'attente entre deux scénarios de vente (triés par date), en centimes : somme nette en
 * plus, diminuée du cash-flow remis entre les deux dates (négatif quand il faut remettre de
 * l'argent). Positif : attendre rapporte ; négatif : attendre coûte. `null` si la date du
 * scénario n'est pas strictement postérieure à celle du précédent : il n'y a pas d'attente (deux
 * scénarios à la même date ne diffèrent que par le prix).
 */
export function waitingGain(
  previous: { date: IsoDate; netSaleProceeds: number; cashFlowUntilSale: number },
  next: { date: IsoDate; netSaleProceeds: number; cashFlowUntilSale: number },
): number | null {
  if (next.date <= previous.date) return null;
  return (
    next.netSaleProceeds -
    previous.netSaleProceeds +
    (next.cashFlowUntilSale - previous.cashFlowUntilSale)
  );
}
