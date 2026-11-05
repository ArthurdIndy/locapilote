/**
 * Valeurs de la simulation de vente calculées automatiquement à partir des données saisies
 * (US11) : chacune peut être remplacée par une valeur modifiée (non `null` dans les
 * hypothèses du bien). Voir docs/regles-de-calcul.md § 6.
 *
 * - loyer net et dépenses projetés : d'après le budget quand l'année des données en a un (US12 :
 *   loyers prévus − gestion et comptable ; copropriété + impôts et taxes + assurances et
 *   entretien), sinon 12 derniers mois du journal (jusqu'à la date de mise à jour), annualisés
 *   si le bien est loué depuis moins longtemps, hors dépenses immobilisées et catégories de
 *   travaux ;
 * - évolution annuelle : 1,5 % ;
 * - amortissements déduits des années futures : ceux de la dernière année complète (LMNP réel) ;
 * - frais de l'année de la vente : honoraires du comptable de la dernière année complète ;
 * - part du prix réinvestie (remploi) : calculée par scénario dans `simulateSale` (ce qui reste
 *   du prix de cession après remboursement du prêt, voir `defaultReinvestedShare`).
 */
import { budgetProjection } from './core/budget';
import type { ProjectionValues } from './core/irr';
import { addDays, addMonths, daysBetween, yearOf } from './dates';
import { LMNP_REEL, lastCompleteYearDeductedDepreciation } from './tax/lmnp-reel';
import type {
  Category,
  Cents,
  Dataset,
  IsoDate,
  Property,
  PropertyAssumptions,
  TaxTreatment,
} from './types';

export const DEFAULT_ANNUAL_GROWTH = 0.015;

/** Catégories des honoraires du comptable : repérées par leur nom (« Honoraires comptable »). */
const ACCOUNTANT_FEES = /comptab/i;
/**
 * Catégories de travaux, exclues de la projection (y compris travaux de copropriété et
 * honoraires sur travaux) : repérées par leur nom, en attendant un marqueur dédié (US02).
 */
const WORKS = /travaux/i;

/**
 * Dépense exclue de la projection : dépense immobilisée (« À amortir ») ou catégorie de
 * travaux. Aucune autre exclusion (décision du 03/11/2026).
 */
export function isExcludedFromProjection(category: Category, property: Property): boolean {
  return treatmentFor(category, property) === 'depreciable' || WORKS.test(category.name);
}

/** Une valeur résolue : celle retenue, si elle est modifiée, et le calcul automatique. */
export interface Resolved<T = number> {
  value: T;
  modified: boolean;
  automatic: T;
}

export interface ResolvedSaleAssumptions {
  netRentMonthly: Resolved;
  annualExpensesExcludingLoan: Resolved;
  annualGrowth: Resolved;
  depreciationDeductedPerYear: Resolved;
  saleYearCosts: Resolved;
  /** Part réinvestie : la valeur automatique dépend du scénario (complétée par `simulateSale`). */
  reinvestedShare: Resolved;
  /** Période du journal retenue pour le loyer et les dépenses (vide si le bien n'est pas loué). */
  journalWindow: { from: IsoDate; to: IsoDate } | null;
  /**
   * Origine du loyer net et des dépenses calculés : le budget (années budgétées : celle des
   * données, puis les suivantes déjà budgétées), ou les 12 derniers mois du journal.
   */
  projectionSource: { kind: 'budget'; years: number[] } | { kind: 'journal' };
  /** Dernière année complète (amortissements, honoraires du comptable). */
  lastCompleteYear: number;
  /** Valeurs pour le bilan depuis l'achat (`ownerBalance`). */
  projection: ProjectionValues;
}

export function resolve(saved: number | null, automatic: number): Resolved {
  return saved === null
    ? { value: automatic, modified: false, automatic }
    : { value: saved, modified: true, automatic };
}

function treatmentFor(category: Category, property: Property): TaxTreatment | undefined {
  return category.taxTreatment[property.taxRegime] ?? category.taxTreatment[LMNP_REEL];
}

/**
 * Recettes et dépenses des 12 derniers mois jusqu'à `dataAsOf` (dépenses hors dépenses
 * immobilisées et catégories de travaux), annualisées si la location a commencé dans la période.
 */
export function journalLastTwelveMonths(
  data: Dataset,
  property: Property,
  dataAsOf: IsoDate,
): { from: IsoDate; to: IsoDate; income: number; expenses: number } | null {
  const rentalStart = property.rentalStartDate;
  if (!rentalStart || rentalStart > dataAsOf) return null;
  const windowStart = addDays(addMonths(dataAsOf, -12), 1);
  const from = rentalStart > windowStart ? rentalStart : windowStart;
  const factor = from === windowStart ? 1 : 365 / (daysBetween(from, dataAsOf) + 1);
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  let income = 0;
  let expenses = 0;
  for (const t of data.transactions) {
    if (t.propertyId !== property.id || t.date < from || t.date > dataAsOf) continue;
    const category = categories.get(t.categoryId);
    if (!category) continue;
    if (category.direction === 'income') income += t.amount;
    else if (category.direction === 'expense' && !isExcludedFromProjection(category, property)) {
      expenses += t.amount;
    }
  }
  return { from, to: dataAsOf, income: income * factor, expenses: expenses * factor };
}

/** Honoraires du comptable payés pendant une année civile. */
export function accountantFees(data: Dataset, property: Property, year: number): Cents {
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  return data.transactions
    .filter((t) => t.propertyId === property.id && t.date.startsWith(`${year}-`))
    .filter((t) => {
      const c = categories.get(t.categoryId);
      return c?.direction === 'expense' && ACCOUNTANT_FEES.test(c.name);
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

/** Hypothèses de vente du bien, valeurs automatiques comprises. */
export function resolveSaleAssumptions(
  data: Dataset,
  property: Property,
  assumptions: PropertyAssumptions,
  dataAsOf: IsoDate,
): ResolvedSaleAssumptions {
  const p = assumptions.projection;
  const growth = resolve(p.annualGrowth, DEFAULT_ANNUAL_GROWTH);
  const budget = budgetProjection(data, property, dataAsOf, growth.value);
  const journal = journalLastTwelveMonths(data, property, dataAsOf);
  const dataYear = yearOf(dataAsOf);
  const depreciation =
    property.taxRegime === LMNP_REEL
      ? lastCompleteYearDeductedDepreciation(data, property, dataAsOf)
      : {
          year: dataAsOf.endsWith('-12-31')
            ? Number(dataAsOf.slice(0, 4))
            : Number(dataAsOf.slice(0, 4)) - 1,
          amount: 0,
        };
  const resolved = {
    netRentMonthly: resolve(
      p.netRentMonthly,
      budget ? budget.netRentMonthly(dataYear) : journal ? journal.income / 12 : 0,
    ),
    annualExpensesExcludingLoan: resolve(
      p.annualExpensesExcludingLoan,
      budget ? budget.annualExpenses(dataYear) : (journal?.expenses ?? 0),
    ),
    annualGrowth: growth,
    depreciationDeductedPerYear: resolve(p.depreciationDeductedPerYear, depreciation.amount),
    saleYearCosts: resolve(p.saleYearCosts, accountantFees(data, property, depreciation.year)),
    reinvestedShare: resolve(p.mainResidenceReinvestedShare, 1),
  };
  // Une valeur modifiée dans Paramètres de vente reste prioritaire : elle évolue chaque année
  // de (1 + évolution). Sinon, chaque année prend son budget (ou le dernier, × évolution).
  const indexed = (value: number) => (year: number) =>
    value * Math.pow(1 + growth.value, year - dataYear);
  const netRentForYear =
    budget && !resolved.netRentMonthly.modified
      ? budget.netRentMonthly
      : indexed(resolved.netRentMonthly.value);
  const expensesForYear =
    budget && !resolved.annualExpensesExcludingLoan.modified
      ? budget.annualExpenses
      : indexed(resolved.annualExpensesExcludingLoan.value);
  const usesBudget =
    budget !== null &&
    (!resolved.netRentMonthly.modified || !resolved.annualExpensesExcludingLoan.modified);
  return {
    ...resolved,
    journalWindow: journal ? { from: journal.from, to: journal.to } : null,
    projectionSource: budget ? { kind: 'budget', years: budget.years } : { kind: 'journal' },
    lastCompleteYear: depreciation.year,
    projection: {
      avoidedRentMonthlyAtPurchase: p.avoidedRentMonthlyAtPurchase,
      avoidedRentIndexation: p.avoidedRentIndexation,
      netRentMonthly: resolved.netRentMonthly.value,
      annualExpensesExcludingLoan: resolved.annualExpensesExcludingLoan.value,
      annualGrowth: resolved.annualGrowth.value,
      saleYearCosts: resolved.saleYearCosts.value,
      ...(usesBudget
        ? {
            monthlyProjectionForYear: (year: number) =>
              netRentForYear(year) - expensesForYear(year) / 12,
          }
        : {}),
    },
  };
}
