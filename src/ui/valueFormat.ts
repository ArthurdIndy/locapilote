/** Valeurs saisies dans les champs « calculé ou modifié » : montants en centimes ou taux. */
import { centsToInput, formatEuros, parseEurosInput, parsePercentInput } from './format';

export type ValueKind = 'euros' | 'percent';

const percentShown = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Taux affiché à 0,1 % près dans un champ : 0.688114 → « 68,8 ». */
export const percentToInput = (rate: number) =>
  String(Math.round(rate * 1000) / 10).replace('.', ',');

export const valueToInput = (kind: ValueKind, value: number) =>
  kind === 'euros' ? centsToInput(Math.round(value)) : percentToInput(value);

export const parseValue = (kind: ValueKind, text: string) =>
  kind === 'euros' ? parseEurosInput(text) : parsePercentInput(text);

/** 105661 → « 1 056,61 € » ; 0.015 → « 1,5 % ». */
export const showValue = (kind: ValueKind, value: number) =>
  kind === 'euros' ? formatEuros(Math.round(value)) : percentShown.format(value);
