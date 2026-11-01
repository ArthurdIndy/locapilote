/**
 * Export CSV des mouvements, lisible directement dans Excel en français :
 * séparateur point-virgule, virgule décimale, dates JJ/MM/AAAA, encodage UTF-8 avec BOM.
 */
import type { Dataset } from '../engine/types';

const DIRECTION_LABELS = {
  income: 'Recette',
  expense: 'Dépense',
  transfer: 'Transfert',
  neutral: 'Neutre',
} as const;

const HEADER = [
  'Date',
  'Bien',
  'Compte',
  'Catégorie',
  'Sens',
  'Libellé',
  'Montant',
  'Pièce',
  'Source',
  'Commentaire',
];

/** Marque d'ordre des octets : indique à Excel que le fichier est en UTF-8 (accents). */
export const UTF8_BOM = '﻿';

/** 105489 → « 1054,89 » ; −10746 → « -107,46 ». Sans séparateur de milliers, pour qu'Excel lise un nombre. */
export function centsToFrenchNumber(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function isoToFrenchDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function escapeCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Mouvements triés par date puis par identifiant, une ligne par mouvement. */
export function transactionsToCsv(data: Dataset): string {
  const propertyNames = new Map(data.properties.map((p) => [p.id, p.name]));
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const rows = [...data.transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((t) => {
      const category = categories.get(t.categoryId);
      return [
        isoToFrenchDate(t.date),
        propertyNames.get(t.propertyId) ?? t.propertyId,
        t.account,
        category?.name ?? t.categoryId,
        category ? DIRECTION_LABELS[category.direction] : '',
        t.label,
        centsToFrenchNumber(t.amount),
        t.document ?? '',
        t.source ?? '',
        t.comment ?? '',
      ];
    });
  return UTF8_BOM + [HEADER, ...rows].map((r) => r.map(escapeCell).join(';')).join('\r\n') + '\r\n';
}
