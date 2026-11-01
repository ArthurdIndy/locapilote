/**
 * Lignes du récapitulatif LMNP réel, communes à l'écran, à la version imprimable et à
 * l'export CSV envoyé au comptable.
 */
import { centsToFrenchNumber, UTF8_BOM } from '../db/csv';
import type { LmnpReelYear } from '../engine/tax/lmnp-reel';
import type { Cents, IsoDate, Property } from '../engine/types';

export type RecapRow =
  | { kind: 'section'; label: string }
  | {
      kind: 'line' | 'detail' | 'total';
      label: string;
      value: (y: LmnpReelYear) => Cents | null;
      /** Un montant négatif est un déficit. */
      deficit?: boolean;
      /** Ligne d'information, hors du calcul du résultat. */
      info?: boolean;
    };

/** Lignes du récapitulatif ; les groupes viennent des catégories (identiques chaque année). */
export function recapRows(years: readonly LmnpReelYear[]): RecapRow[] {
  const first = years[0];
  const incomeGroups = first?.incomeByGroup.map((g) => g.group) ?? [];
  const expenseGroups = first?.expensesByGroup.map((g) => g.group) ?? [];
  const groupValue =
    (pick: 'incomeByGroup' | 'expensesByGroup', group: string) => (y: LmnpReelYear) =>
      y[pick].find((g) => g.group === group)?.amount ?? 0;

  return [
    { kind: 'section', label: 'Recettes imposables' },
    ...incomeGroups.map((g): RecapRow => ({
      kind: 'detail',
      label: g,
      value: groupValue('incomeByGroup', g),
    })),
    { kind: 'total', label: 'Total des recettes imposables', value: (y) => y.taxableIncome },
    { kind: 'section', label: 'Charges déductibles' },
    ...expenseGroups.map((g): RecapRow => ({
      kind: 'detail',
      label: g,
      value: groupValue('expensesByGroup', g),
    })),
    { kind: 'detail', label: 'Intérêts d’emprunt (période louée)', value: (y) => y.loanInterest },
    {
      kind: 'detail',
      label: 'Assurance emprunteur (période louée)',
      value: (y) => y.loanInsurance,
    },
    { kind: 'total', label: 'Total des charges déductibles', value: (y) => y.deductibleExpenses },
    {
      kind: 'total',
      label: 'Résultat avant amortissements',
      value: (y) => y.resultBeforeDepreciation,
      deficit: true,
    },
    { kind: 'section', label: 'Amortissements' },
    {
      kind: 'line',
      label: 'Dotations aux amortissements de l’année',
      value: (y) => y.depreciation,
    },
    {
      kind: 'line',
      label: 'Amortissements en report (début d’année)',
      value: (y) => y.carryforwardStart,
    },
    { kind: 'line', label: 'Amortissements utilisés', value: (y) => y.depreciationUsed },
    {
      kind: 'line',
      label: 'Amortissements en report (fin d’année, calcul de l’outil)',
      value: (y) => y.carryforwardEnd,
    },
    {
      kind: 'line',
      label: 'Stock reporté retenu par le comptable',
      value: (y) => y.accountantCarryforward,
    },
    { kind: 'section', label: 'Résultat' },
    { kind: 'total', label: 'Résultat fiscal estimé', value: (y) => y.taxResult, deficit: true },
    { kind: 'section', label: 'Non retenus dans le résultat' },
    {
      kind: 'line',
      label: 'Dépenses à qualifier (non retenues)',
      value: (y) => y.toReview,
      info: true,
    },
    {
      kind: 'line',
      label: 'Investissements de l’année (à amortir)',
      value: (y) => y.investments,
      info: true,
    },
  ];
}

const csvCell = (value: string) =>
  /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Récapitulatif annuel en CSV (séparateur point-virgule, virgule décimale, UTF-8 avec BOM),
 * une colonne par année : lisible directement dans Excel, à envoyer au comptable.
 */
export function recapToCsv(
  property: Property,
  years: readonly LmnpReelYear[],
  dataAsOf: IsoDate,
): string {
  const [y, m, d] = dataAsOf.split('-');
  const lines: string[][] = [
    [`Récapitulatif LMNP au réel · ${property.name}`],
    [`Données à jour au ${d}/${m}/${y}`],
    [
      'Estimation à vocation de suivi, pas un conseil fiscal : à faire confirmer par un expert-comptable.',
    ],
    [],
    ['Rubrique', ...years.map((k) => String(k.year))],
  ];
  for (const row of recapRows(years)) {
    if (row.kind === 'section') {
      lines.push([row.label]);
      continue;
    }
    lines.push([
      row.label,
      ...years.map((k) => {
        const v = row.value(k);
        return v === null ? '' : centsToFrenchNumber(v);
      }),
    ]);
  }
  return UTF8_BOM + lines.map((l) => l.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
