/**
 * Module fiscal LMNP au réel : récapitulatif annuel d'un bien (recettes imposables, charges
 * déductibles, amortissements, report, résultat fiscal). Fonctions pures, montants en centimes.
 * Voir docs/regles-de-calcul.md § 3 et § 4.
 *
 * Hors périmètre (US09) : report des déficits ordinaires, liasse 2031/2033, plus-value.
 */
import { sumInstallments } from '../core/loan';
import { RENT_GROUP, synthesisYears } from '../core/synthesis';
import { addDays, addMonths, daysBetween } from '../dates';
import type {
  AccountantFiling,
  Asset,
  Category,
  Cents,
  Dataset,
  FilingLine,
  IsoDate,
  Property,
  TaxTreatment,
} from '../types';

/** Le régime de ce module. */
export const LMNP_REEL = 'lmnp-reel';

// ---------- Amortissements (§ 4) ----------

/** Dotation annuelle pleine = valeur / durée, en centimes non arrondis (0 si non amorti). */
export function annualDepreciation(asset: Asset): number {
  return asset.durationYears > 0 ? asset.value / asset.durationYears : 0;
}

/**
 * Dernier jour d'amortissement : mise en service + durée (en mois arrondis) − 1 jour.
 * `null` si l'immobilisation n'est pas amortie (durée 0).
 */
export function depreciationEndDate(asset: Asset): IsoDate | null {
  if (asset.durationYears <= 0) return null;
  const end = addMonths(asset.inServiceDate, Math.round(asset.durationYears * 12));
  return addDays(end, -1);
}

/**
 * Dotation de l'année, au prorata des jours (base 365), en centimes non arrondis :
 * MIN(dotation annuelle, jours amortis dans l'année × dotation annuelle / 365).
 */
export function assetDepreciation(asset: Asset, year: number): number {
  const end = depreciationEndDate(asset);
  if (end === null) return 0;
  const from = asset.inServiceDate > `${year}-01-01` ? asset.inServiceDate : `${year}-01-01`;
  const to = end < `${year}-12-31` ? end : `${year}-12-31`;
  const days = Math.max(0, daysBetween(from, to) + 1);
  const annual = annualDepreciation(asset);
  return Math.min(annual, (days * annual) / 365);
}

/**
 * Dotation totale de l'année pour un ensemble d'immobilisations, arrondie au centime
 * (le total est arrondi, pas chaque ligne : c'est ce que retient le comptable du jeu de test).
 */
export function yearDepreciation(assets: readonly Asset[], year: number): Cents {
  return Math.round(assets.reduce((sum, a) => sum + assetDepreciation(a, year), 0));
}

// ---------- Récapitulatif annuel (§ 3) ----------

export interface GroupAmount {
  group: string;
  amount: Cents;
}

export interface LmnpReelYear {
  year: number;
  /** Recettes imposables, par groupe (tous les groupes paramétrés, même à 0). */
  incomeByGroup: GroupAmount[];
  taxableIncome: Cents;
  /** Charges déductibles saisies dans les mouvements, par groupe. */
  expensesByGroup: GroupAmount[];
  /** Intérêts et assurance emprunteur des échéances de la période louée. */
  loanInterest: Cents;
  loanInsurance: Cents;
  deductibleExpenses: Cents;
  /** Recettes − charges ; négatif = déficit (son report n'est pas géré). */
  resultBeforeDepreciation: Cents;
  depreciation: Cents;
  carryforwardStart: Cents;
  /** Le report de début d'année vient du stock saisi par le comptable pour l'année précédente. */
  carryforwardStartFromAccountant: boolean;
  /** MIN(dotation + report de début, MAX(0, résultat avant amortissements)). */
  depreciationUsed: Cents;
  /** Report de fin d'année calculé par l'outil = report de début + dotation − utilisés. */
  carryforwardEnd: Cents;
  /** Stock reporté retenu par le comptable pour cette année, s'il est saisi (il fait foi). */
  accountantCarryforward: Cents | null;
  /** Résultat avant amortissements − amortissements utilisés ; négatif = déficit. */
  taxResult: Cents;
  /** Dépenses « À valider » : non retenues dans le résultat. */
  toReview: Cents;
  toReviewCount: number;
  /** Investissements de l'année (« À amortir ») : à reporter dans les immobilisations. */
  investments: Cents;
}

/** Traitement fiscal LMNP réel d'une catégorie. */
function treatment(category: Category): TaxTreatment | undefined {
  return category.taxTreatment[LMNP_REEL];
}

/** Montant au résultat : + pour une recette, − pour une dépense, 0 sinon. */
function resultAmount(category: Category, amount: Cents): Cents {
  if (category.direction === 'income') return amount;
  if (category.direction === 'expense') return -amount;
  return 0;
}

/**
 * Groupes des catégories d'un traitement donné : les loyers d'abord, les groupes « Autres… »
 * en dernier, les autres par ordre alphabétique.
 */
function groupsOf(categories: readonly Category[], kind: TaxTreatment): string[] {
  const rank = (g: string) => (g === RENT_GROUP ? 0 : /^autres?\b/i.test(g) ? 2 : 1);
  return [...new Set(categories.filter((c) => treatment(c) === kind).map((c) => c.group))].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'),
  );
}

const sum = (amounts: readonly GroupAmount[]) => amounts.reduce((s, g) => s + g.amount, 0);

/**
 * Récapitulatif LMNP réel d'un bien, de l'année de mise en location à celle de la date de
 * mise à jour des données. Le report de chaque année part du stock du comptable de l'année
 * précédente s'il est saisi, sinon du report de fin calculé.
 */
export function lmnpReelSummary(
  data: Dataset,
  property: Property,
  dataAsOf: IsoDate,
): LmnpReelYear[] {
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const incomeGroups = groupsOf(data.categories, 'taxable');
  const expenseGroups = groupsOf(data.categories, 'deductible');
  const assets = data.assets.filter((a) => a.propertyId === property.id);
  const loanIds = new Set(data.loans.filter((l) => l.propertyId === property.id).map((l) => l.id));
  const accountantStock = new Map(
    data.accountantCarryforwards
      .filter((c) => c.propertyId === property.id)
      .map((c) => [c.year, c.carriedForward]),
  );
  const rentalStart = property.rentalStartDate;

  const result: LmnpReelYear[] = [];
  let previousEnd = 0;
  for (const year of synthesisYears(property, dataAsOf)) {
    const prefix = `${year}-`;
    const income = new Map(incomeGroups.map((g) => [g, 0]));
    const expenses = new Map(expenseGroups.map((g) => [g, 0]));
    let toReview = 0;
    let toReviewCount = 0;
    let investments = 0;
    for (const t of data.transactions) {
      if (t.propertyId !== property.id || !t.date.startsWith(prefix)) continue;
      const category = categories.get(t.categoryId);
      if (!category) continue;
      const amount = resultAmount(category, t.amount);
      switch (treatment(category)) {
        case 'taxable':
          income.set(category.group, (income.get(category.group) ?? 0) + amount);
          break;
        case 'deductible':
          expenses.set(category.group, (expenses.get(category.group) ?? 0) - amount);
          break;
        case 'to-review':
          toReview -= amount;
          toReviewCount += 1;
          break;
        case 'depreciable':
          investments -= amount;
          break;
      }
    }

    const loan = sumInstallments(
      data.loanInstallments,
      (i) =>
        loanIds.has(i.loanId) &&
        i.date.startsWith(prefix) &&
        rentalStart !== null &&
        i.date >= rentalStart &&
        i.date <= dataAsOf,
    );

    const incomeByGroup = [...income].map(([group, amount]) => ({ group, amount }));
    const expensesByGroup = [...expenses].map(([group, amount]) => ({ group, amount }));
    const taxableIncome = sum(incomeByGroup);
    const deductibleExpenses = sum(expensesByGroup) + loan.interest + loan.insurance;
    const resultBeforeDepreciation = taxableIncome - deductibleExpenses;
    const depreciation = yearDepreciation(assets, year);

    const stockBefore = accountantStock.get(year - 1);
    const carryforwardStart = stockBefore ?? previousEnd;
    const depreciationUsed = Math.min(
      depreciation + carryforwardStart,
      Math.max(0, resultBeforeDepreciation),
    );
    const carryforwardEnd = carryforwardStart + depreciation - depreciationUsed;
    previousEnd = carryforwardEnd;

    result.push({
      year,
      incomeByGroup,
      taxableIncome,
      expensesByGroup,
      loanInterest: loan.interest,
      loanInsurance: loan.insurance,
      deductibleExpenses,
      resultBeforeDepreciation,
      depreciation,
      carryforwardStart,
      carryforwardStartFromAccountant: stockBefore !== undefined,
      depreciationUsed,
      carryforwardEnd,
      accountantCarryforward: accountantStock.get(year) ?? null,
      taxResult: resultBeforeDepreciation - depreciationUsed,
      toReview,
      toReviewCount,
      investments,
    });
  }
  return result;
}

// ---------- Rapprochement avec le comptable ----------

export type ReconciliationStatus = 'not-entered' | 'ok' | 'explained' | 'to-explain';

export interface ReconciliationLine {
  line: FilingLine | 'carryforward';
  /** Calcul de Locapilote. */
  tool: Cents;
  /** Montant des comptes déposés, s'il est saisi. */
  accountant: Cents | null;
  /** Locapilote − comptable. */
  gap: Cents | null;
  comment: string;
  status: ReconciliationStatus;
}

/** Écart toléré (arrondis) : 1 centime. */
export const RECONCILIATION_TOLERANCE: Cents = 1;

/**
 * Rapprochement d'une année : recettes, charges hors amortissements, dotations, résultat,
 * et stock d'amortissements reporté en fin d'année. Un écart est « expliqué » quand un
 * commentaire est saisi, « à expliquer » sinon.
 */
export function reconcile(
  year: LmnpReelYear,
  filing: AccountantFiling | undefined,
): ReconciliationLine[] {
  const lines: [ReconciliationLine['line'], Cents, Cents | null][] = [
    ['income', year.taxableIncome, filing?.amounts.income ?? null],
    ['expenses', year.deductibleExpenses, filing?.amounts.expenses ?? null],
    ['depreciation', year.depreciation, filing?.amounts.depreciation ?? null],
    ['result', year.taxResult, filing?.amounts.result ?? null],
    ['carryforward', year.carryforwardEnd, year.accountantCarryforward],
  ];
  return lines.map(([line, tool, accountant]) => {
    const comment = filing?.comments[line]?.trim() ?? '';
    const gap = accountant === null ? null : tool - accountant;
    const status: ReconciliationStatus =
      gap === null
        ? 'not-entered'
        : Math.abs(gap) <= RECONCILIATION_TOLERANCE
          ? 'ok'
          : comment
            ? 'explained'
            : 'to-explain';
    return { line, tool, accountant, gap, comment, status };
  });
}
