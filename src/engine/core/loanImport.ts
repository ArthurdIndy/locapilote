/**
 * Lecture d'un tableau d'amortissement copié depuis Excel (colonnes séparées par des
 * tabulations) ou d'un fichier CSV (point-virgule ou virgule).
 *
 * Colonnes attendues, dans cet ordre : date, capital dû, capital, intérêts, assurance.
 * Tolérances : une ligne d'en-tête (ou toute ligne sans date) est ignorée ; une première
 * colonne « numéro d'échéance » est ignorée ; l'assurance peut manquer (elle vaut alors 0).
 * Dates JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA ou AAAA-MM-JJ ; montants « 1 234,56 », « 1234.56 »,
 * « 1.234,56 € ».
 *
 * Le « capital dû » peut être celui d'avant l'échéance ou d'après : on le détecte sur la
 * première ligne, en le comparant au montant emprunté.
 */
import { isValidIsoDate, toIso } from '../dates';
import type { Cents, IsoDate, Loan, LoanInstallment } from '../types';

export interface ParsedSchedule {
  installments: LoanInstallment[];
  /** Lignes ignorées (en-têtes, lignes vides de sens), numéros de ligne à partir de 1. */
  skippedLines: number[];
  /** Problèmes bloquants : l'import ne doit pas être fait. */
  errors: string[];
  /** Points d'attention, non bloquants. */
  warnings: string[];
}

function detectSeparator(lines: string[]): string {
  const sample = lines.slice(0, 20).join('\n');
  if (sample.includes('\t')) return '\t';
  if (sample.includes(';')) return ';';
  return ',';
}

function splitLine(line: string, separator: string): string[] {
  // Gestion simple des guillemets CSV (« "1 234,56" »).
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === separator && !quoted) {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

/** « 05/12/2017 », « 5-12-17 », « 2017-12-05 » → « 2017-12-05 » ; null si ce n'est pas une date. */
export function parseDateCell(text: string): IsoDate | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
    return isValidIsoDate(iso) ? iso : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = toIso(year, Number(m[2]), Number(m[1]));
    return isValidIsoDate(iso) ? iso : null;
  }
  return null;
}

/**
 * Montant en euros → centimes. `decimalComma` : la virgule est le séparateur décimal
 * (cas d'Excel en français et du CSV à point-virgule). Vide → 0. null si illisible.
 */
export function parseAmountCell(text: string, decimalComma: boolean): Cents | null {
  let t = text.replace(/[\s\u00a0\u202f\u20ac]/g, '');
  if (t === '' || t === '-') return 0;
  if (decimalComma) {
    // « 1.234,56 » : le point sépare les milliers.
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  } else {
    t = t.replace(/,/g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function parseScheduleText(text: string, loan: Loan): ParsedSchedule {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const separator = detectSeparator(lines);
  const decimalComma = separator !== ',';
  const errors: string[] = [];
  const warnings: string[] = [];
  const skippedLines: number[] = [];

  interface Row {
    line: number;
    date: IsoDate;
    due: Cents;
    principal: Cents;
    interest: Cents;
    insurance: Cents;
  }
  const rows: Row[] = [];

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    if (rawLine.trim() === '') return;
    let cells = splitLine(rawLine, separator);
    // Première colonne « numéro » : un entier suivi d'une date.
    if (cells.length >= 5 && /^\d+$/.test(cells[0]!) && parseDateCell(cells[1]!)) {
      cells = cells.slice(1);
    }
    const date = parseDateCell(cells[0] ?? '');
    if (!date) {
      skippedLines.push(lineNumber);
      return;
    }
    if (cells.length < 4) {
      errors.push(
        `Ligne ${lineNumber} : il faut au moins 4 colonnes (date, capital dû, capital, intérêts).`,
      );
      return;
    }
    const [due, principal, interest, insurance] = [1, 2, 3, 4].map((c) =>
      parseAmountCell(cells[c] ?? '', decimalComma),
    );
    if (due === null || principal === null || interest === null || insurance === null) {
      errors.push(`Ligne ${lineNumber} : montant illisible.`);
      return;
    }
    rows.push({
      line: lineNumber,
      date,
      due: due!,
      principal: principal!,
      interest: interest!,
      insurance: insurance!,
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push('Aucune échéance trouvée : chaque ligne doit commencer par une date.');
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.date <= rows[i - 1]!.date) {
      errors.push(`Ligne ${rows[i]!.line} : les dates doivent être dans l'ordre croissant.`);
      break;
    }
  }
  const missingInsuranceColumn = rows.length > 0 && rows.every((r) => r.insurance === 0);
  if (missingInsuranceColumn && loan.monthlyInsurance > 0) {
    warnings.push('Aucune assurance dans le tableau : elle est comptée à 0.');
  }

  // Capital dû avant ou après l'échéance ?
  const first = rows[0];
  const dueIsAfter =
    first !== undefined &&
    Math.abs(first.due - (loan.principal - first.principal)) < Math.abs(first.due - loan.principal);

  const installments = rows.map((r, i) => ({
    loanId: loan.id,
    number: i + 1,
    date: r.date,
    principalBefore: dueIsAfter ? r.due + r.principal : r.due,
    principal: r.principal,
    interest: r.interest,
    insurance: r.insurance,
  }));

  const repaid = installments.reduce((s, i) => s + i.principal, 0);
  // Tolérance : un centime d'arrondi par échéance.
  if (rows.length > 0 && Math.abs(repaid - loan.principal) > rows.length) {
    warnings.push(
      `La somme du capital des échéances (${(repaid / 100).toFixed(2).replace('.', ',')} €) ` +
        `ne correspond pas au montant emprunté (${(loan.principal / 100).toFixed(2).replace('.', ',')} €). ` +
        'Vérifie le tableau (lignes manquantes ?) ou le montant du prêt.',
    );
  }
  if (rows.length > 0 && rows.length !== loan.durationMonths) {
    warnings.push(`${rows.length} échéances lues pour un prêt de ${loan.durationMonths} mois.`);
  }

  return { installments: errors.length > 0 ? [] : installments, skippedLines, errors, warnings };
}
