/**
 * Budget d'un bien pour une année (US12, version légère) : ce qui était prévu, ce qui est payé
 * ou perçu, et ce qui dérive. Socle commun, indépendant du régime fiscal.
 * Voir docs/regles-de-calcul.md § 8 (Budget).
 *
 * Entrées : loyers et charges perçus. Sorties : une ligne par groupe de catégories
 * (copropriété, gestion et comptable, impôts et taxes, assurances, entretien, autres dépenses)
 * et le prêt (d'après l'échéancier) ; « Total des sorties » ; « À sortir de ta poche » = total
 * des sorties − entrées.
 *
 * Colonnes, pour l'année N :
 * - N−1 réel : opérations de l'année précédente, ramenées à 12 mois au prorata des mois loués
 *   si la location a commencé en cours d'année (année future : N−1 estimé ou prévu) ;
 * - N prévu : N−1 réel × (1 + évolution), « Autres dépenses » à 0, ou la valeur modifiée (✎) ;
 * - N estimé fin d'année (année en cours) = payé à ce jour + reste prévu ; N réel (année
 *   terminée) ;
 * - écart = estimé (ou réel) − prévu.
 *
 * Montants en centimes, arrondis au centime.
 */
import { addDays, addMonths, daysBetween, isLeapYear, yearOf } from '../dates';
import {
  BUDGET_LINES,
  type BudgetLine,
  type Category,
  type Dataset,
  type IsoDate,
  type Property,
  type TaxTreatment,
} from '../types';
import { installmentTotal } from './loan';
import { rentalMonths } from './synthesis';

/**
 * Ligne du tableau : une ligne modifiable, le prêt, « Total des sorties » ou « À sortir de ta
 * poche ».
 */
export type BudgetRowId = BudgetLine | 'loan' | 'totalExpenses' | 'outOfPocket';

/** Lignes de dépense (tout sauf les loyers). */
export const BUDGET_EXPENSE_LINES: readonly BudgetLine[] = BUDGET_LINES.filter(
  (l) => l !== 'income',
);

/**
 * Groupe de synthèse des catégories → ligne du budget. Un groupe absent de cette table (par
 * exemple « Autres charges ») va dans « Autres dépenses », sauf les frais bancaires.
 */
const GROUP_LINES: Readonly<Record<string, BudgetLine>> = {
  Copropriété: 'coOwnership',
  'Frais de gestion': 'management',
  'Impôts et taxes': 'taxes',
  Assurances: 'insurance',
  'Entretien et petit équipement': 'maintenance',
};

/**
 * Frais bancaires : dépense régulière, dans « Gestion et comptable » (décision d'Arthur du
 * 05/11/2026), alors que leur groupe de synthèse est « Autres charges ». Repérés par leur nom
 * en attendant un marqueur dédié (US02).
 */
const BANK_FEES = /frais bancaires/i;

function treatmentFor(category: Category, property: Property): TaxTreatment | undefined {
  return category.taxTreatment[property.taxRegime] ?? category.taxTreatment['lmnp-reel'];
}

/**
 * Ligne du budget d'une catégorie : toutes les recettes dans « Loyers et charges perçus » ;
 * investissements à amortir et dépenses à qualifier dans « Autres dépenses » ; frais bancaires
 * dans « Gestion et comptable » ; les autres dépenses selon leur groupe (les honoraires sur
 * travaux, du groupe « Frais de gestion », vont donc dans « Gestion et comptable »). `null` :
 * transfert ou dépôt de garantie (hors budget).
 */
export function budgetLineOf(category: Category, property: Property): BudgetLine | null {
  if (category.direction === 'income') return 'income';
  if (category.direction !== 'expense') return null;
  const treatment = treatmentFor(category, property);
  if (treatment === 'depreciable' || treatment === 'to-review') return 'other';
  if (BANK_FEES.test(category.name)) return 'management';
  return GROUP_LINES[category.group] ?? 'other';
}

/** Montants par ligne (sans le total). */
type Amounts = Record<BudgetLine | 'loan', number>;

function zero(): Amounts {
  return {
    income: 0,
    coOwnership: 0,
    management: 0,
    taxes: 0,
    insurance: 0,
    maintenance: 0,
    other: 0,
    loan: 0,
  };
}

/** Opérations et échéances de prêt du bien, par ligne, du `from` au `to` inclus. */
export function budgetAmounts(
  data: Dataset,
  property: Property,
  from: IsoDate,
  to: IsoDate,
): Amounts {
  const amounts = zero();
  if (to < from) return amounts;
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  for (const t of data.transactions) {
    if (t.propertyId !== property.id || t.date < from || t.date > to) continue;
    const category = categories.get(t.categoryId);
    const line = category ? budgetLineOf(category, property) : null;
    if (line) amounts[line] += t.amount;
  }
  const loanIds = new Set(data.loans.filter((l) => l.propertyId === property.id).map((l) => l.id));
  for (const i of data.loanInstallments) {
    if (loanIds.has(i.loanId) && i.date >= from && i.date <= to)
      amounts.loan += installmentTotal(i);
  }
  return amounts;
}

const mapAmounts = (a: Amounts, f: (value: number, line: BudgetLine | 'loan') => number): Amounts =>
  Object.fromEntries(
    (Object.keys(a) as (BudgetLine | 'loan')[]).map((line) => [line, f(a[line], line)]),
  ) as Amounts;

/** Total des sorties = dépenses + prêt. */
function totalExpenses(a: Amounts): number {
  return BUDGET_EXPENSE_LINES.reduce((sum, l) => sum + a[l], 0) + a.loan;
}

/** Vrai pour une ligne qui se corrige (✎). */
export function isBudgetLine(id: BudgetRowId): id is BudgetLine {
  return (BUDGET_LINES as readonly string[]).includes(id);
}

export type BudgetYearKind = 'past' | 'current' | 'future';

export interface BudgetRow {
  id: BudgetRowId;
  /** N−1 réel ; pour une année future, N−1 estimé (année en cours) ou prévu. */
  previous: number;
  /** N prévu : valeur modifiée si elle existe, sinon le calcul automatique. */
  planned: number;
  /** N prévu calculé automatiquement. */
  automatic: number;
  /** Vrai si le prévu a été modifié (✎). */
  modified: boolean;
  /** Année en cours : estimé fin d'année ; année terminée : réel ; année future : `null`. */
  actual: number | null;
  /** Année en cours : payé (ou perçu) à la date des données. */
  paidToDate: number | null;
  /** Année en cours : N−1 à la même date. */
  previousToDate: number | null;
  /** Écart / prévu = estimé (ou réel) − prévu ; `null` pour une année future. */
  gap: number | null;
}

export interface YearBudget {
  year: number;
  kind: BudgetYearKind;
  dataAsOf: IsoDate;
  /**
   * Dans l'ordre du tableau : loyers (entrées), dépenses et prêt (sorties), « Total des
   * sorties », puis « À sortir de ta poche ».
   */
  rows: BudgetRow[];
  /** N−1 ramené à 12 mois (location commencée en cours d'année N−1). */
  previousProrated: boolean;
}

/** Facteur pour ramener une année de location incomplète à 12 mois (1 si l'année est entière). */
function annualizationFactor(property: Property, year: number): number {
  const months = rentalMonths(year, property.rentalStartDate, `${year}-12-31`);
  return months > 0 && months < 12 ? 12 / months : 1;
}

/** Valeurs prévues modifiées d'une année (✎). */
export function savedBudget(
  data: Dataset,
  property: Property,
  year: number,
): Partial<Record<BudgetLine, number>> {
  return data.budgets.find((b) => b.propertyId === property.id && b.year === year)?.planned ?? {};
}

/**
 * Budget de l'année `year` du bien, à la date des données `dataAsOf`, avec l'évolution
 * annuelle `growth` (Paramètres de vente, 1,5 % par défaut).
 */
export function yearBudget(
  data: Dataset,
  property: Property,
  year: number,
  dataAsOf: IsoDate,
  growth: number,
): YearBudget {
  const dataYear = yearOf(dataAsOf);
  const kind: BudgetYearKind = year < dataYear ? 'past' : year === dataYear ? 'current' : 'future';
  const saved = savedBudget(data, property, year);

  // N−1 : réel (ramené à 12 mois), ou, pour une année future, l'estimé ou le prévu de N−1.
  let previous: Amounts;
  let previousProrated = false;
  if (year - 1 < dataYear) {
    const factor = annualizationFactor(property, year - 1);
    previousProrated = factor !== 1;
    const raw = budgetAmounts(data, property, `${year - 1}-01-01`, `${year - 1}-12-31`);
    previous = mapAmounts(raw, (v, line) => (line === 'loan' ? v : Math.round(v * factor)));
  } else {
    const before = yearBudget(data, property, year - 1, dataAsOf, growth);
    previous = zero();
    for (const row of before.rows) {
      if (row.id !== 'outOfPocket' && row.id !== 'totalExpenses') {
        previous[row.id] = row.actual ?? row.planned;
      }
    }
  }

  // N prévu : N−1 × (1 + évolution) ; « Autres dépenses » à 0 ; prêt d'après l'échéancier.
  const schedule = budgetAmounts(data, property, `${year}-01-01`, `${year}-12-31`).loan;
  const automatic = mapAmounts(previous, (v, line) =>
    line === 'loan' ? schedule : line === 'other' ? 0 : Math.round(v * (1 + growth)),
  );
  const planned = mapAmounts(automatic, (v, line) =>
    line !== 'loan' && saved[line] !== undefined ? saved[line] : v,
  );

  // Réel (année terminée) ou estimé fin d'année (année en cours).
  let actual: Amounts | null = null;
  let paid: Amounts | null = null;
  let previousToDate: Amounts | null = null;
  if (kind === 'past') {
    actual = budgetAmounts(data, property, `${year}-01-01`, `${year}-12-31`);
  } else if (kind === 'current') {
    const sameDate = addMonths(dataAsOf, -12);
    paid = budgetAmounts(data, property, `${year}-01-01`, dataAsOf);
    previousToDate = budgetAmounts(data, property, `${year - 1}-01-01`, sameDate);
    const remainingLastYear = budgetAmounts(
      data,
      property,
      addDays(sameDate, 1),
      `${year - 1}-12-31`,
    );
    const remainingSchedule = budgetAmounts(data, property, addDays(dataAsOf, 1), `${year}-12-31`);
    const remainingShare = daysBetween(dataAsOf, `${year}-12-31`) / (isLeapYear(year) ? 366 : 365);
    const p = paid;
    actual = mapAmounts(planned, (plan, line) => {
      if (line === 'loan') return p.loan + remainingSchedule.loan;
      // Reste prévu : N−1 sur la même période restante × (N prévu / N−1 réel), pour garder la
      // saisonnalité ; sans historique, N prévu × part de l'année restante.
      const rest =
        previous[line] !== 0
          ? (remainingLastYear[line] * plan) / previous[line]
          : plan * remainingShare;
      return p[line] + Math.round(rest);
    });
  }

  const ids: BudgetRowId[] = [...BUDGET_LINES, 'loan', 'totalExpenses', 'outOfPocket'];
  const value = (a: Amounts | null, id: BudgetRowId) =>
    a === null
      ? null
      : id === 'totalExpenses'
        ? totalExpenses(a)
        : id === 'outOfPocket'
          ? totalExpenses(a) - a.income
          : a[id];
  const rows = ids.map((id): BudgetRow => {
    const plan = value(planned, id)!;
    const act = value(actual, id);
    return {
      id,
      previous: value(previous, id)!,
      planned: plan,
      automatic: value(automatic, id)!,
      modified: isBudgetLine(id) && saved[id] !== undefined,
      actual: act,
      paidToDate: value(paid, id),
      previousToDate: value(previousToDate, id),
      gap: act === null ? null : act - plan,
    };
  });
  return { year, kind, dataAsOf, rows, previousProrated };
}

/**
 * Années proposées dans le sélecteur : de l'année de mise en location à l'année suivant celle
 * des données. Vide si le bien n'a pas de date de mise en location.
 */
export function budgetYears(property: Property, dataAsOf: IsoDate): number[] {
  if (!property.rentalStartDate) return [];
  const first = yearOf(property.rentalStartDate);
  const last = Math.max(first, yearOf(dataAsOf) + 1);
  const years: number[] = [];
  for (let y = first; y <= last; y++) years.push(y);
  return years;
}

/**
 * Le budget de l'année a une base : la location a commencé avant cette année (il y a un
 * N−1 réel), ou une ligne a été modifiée.
 */
export function hasBudget(data: Dataset, property: Property, year: number): boolean {
  const start = property.rentalStartDate;
  return (
    (start !== null && start < `${year}-01-01`) ||
    Object.keys(savedBudget(data, property, year)).length > 0
  );
}

/** Loyer net et dépenses projetés, d'après le budget, pour la simulation de vente. */
export interface BudgetProjection {
  /** Années dont le budget sert : celle des données, puis les suivantes déjà budgétées. */
  years: number[];
  /** Loyer net par mois = (loyers et charges perçus − gestion et comptable) prévus / 12. */
  netRentMonthly: (year: number) => number;
  /** Dépenses par an = copropriété + impôts et taxes + assurances + entretien prévus. */
  annualExpenses: (year: number) => number;
}

/**
 * Projection de la vente d'après le budget (§ 6) : pour une année budgétée, ses montants
 * prévus ; pour les suivantes, ceux du dernier budget × (1 + évolution) par an. `null` si
 * l'année des données n'a pas de budget (on garde alors les 12 derniers mois du journal).
 * « Autres dépenses » et le prêt n'en font pas partie.
 */
export function budgetProjection(
  data: Dataset,
  property: Property,
  dataAsOf: IsoDate,
  growth: number,
): BudgetProjection | null {
  const dataYear = yearOf(dataAsOf);
  if (!hasBudget(data, property, dataYear)) return null;
  const later = data.budgets
    .filter(
      (b) => b.propertyId === property.id && b.year > dataYear && Object.keys(b.planned).length > 0,
    )
    .map((b) => b.year)
    .sort((a, b) => a - b);
  const years = [dataYear, ...later];
  const bases = new Map(
    years.map((y) => {
      const rows = yearBudget(data, property, y, dataAsOf, growth).rows;
      const plan = (id: BudgetRowId) => rows.find((r) => r.id === id)!.planned;
      return [
        y,
        {
          netRentMonthly: (plan('income') - plan('management')) / 12,
          annualExpenses:
            plan('coOwnership') + plan('taxes') + plan('insurance') + plan('maintenance'),
        },
      ] as const;
    }),
  );
  const at = (year: number) => {
    const base = years.filter((y) => y <= year).at(-1) ?? dataYear;
    const factor = Math.pow(1 + growth, Math.max(0, year - base));
    const b = bases.get(base)!;
    return { netRentMonthly: b.netRentMonthly * factor, annualExpenses: b.annualExpenses * factor };
  };
  return {
    years,
    netRentMonthly: (year) => at(year).netRentMonthly,
    annualExpenses: (year) => at(year).annualExpenses,
  };
}
