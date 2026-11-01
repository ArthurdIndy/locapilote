import { describe, expect, it } from 'vitest';
import { loadTestDataset } from '../../db/testDataset';
import { addMonths, daysBetween, endOfMonth, isValidIsoDate } from '../dates';
import type { Loan } from '../types';
import {
  generateEstimatedSchedule,
  installmentsOf,
  lastInstallmentDate,
  loanYears,
  outstandingPrincipal,
} from './loan';
import { parseAmountCell, parseDateCell, parseScheduleText } from './loanImport';

const dataset = loadTestDataset();
const loan = dataset.loans[0]!;
const bank = installmentsOf(loan, dataset.loanInstallments);

describe('dates sans fuseau horaire', () => {
  it('ajoute des mois en ramenant au dernier jour du mois', () => {
    expect(addMonths('2017-12-05', 1)).toBe('2018-01-05');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2017-12-05', 239)).toBe('2037-11-05');
  });
  it('compte les jours et trouve la fin du mois', () => {
    expect(daysBetween('2024-05-18', '2024-12-31')).toBe(227);
    expect(endOfMonth('2026-10-25')).toBe('2026-10-31');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(isValidIsoDate('2025-02-29')).toBe(false);
  });
});

describe('échéancier de la banque du jeu de test', () => {
  it('compte 240 échéances qui remboursent le capital (à 6 centimes près, arrondis du jeu de test)', () => {
    expect(bank).toHaveLength(240);
    expect(bank.reduce((s, i) => s + i.principal, 0)).toBe(loan.principal - 6);
    expect(outstandingPrincipal(loan, dataset.loanInstallments, '2037-11-05')).toBe(6);
  });

  it('donne capital, intérêts et assurance par année', () => {
    const years = loanYears(loan, dataset.loanInstallments);
    expect(years[0]!.year).toBe(2017);
    expect(years.at(-1)!.year).toBe(2037);
    const y2025 = years.find((y) => y.year === 2025)!;
    expect(y2025.count).toBe(12);
    // Toute l'année 2025 est en période louée : mêmes chiffres que la synthèse.
    expect(y2025.principal).toBe(817619);
    expect(y2025.interest).toBe(167876);
    expect(y2025.insurance).toBe(24096);
    expect(y2025.outstandingAtYearEnd).toBe(10747874);
    expect(years.reduce((s, y) => s + y.principal, 0)).toBe(loan.principal - 6);
  });

  it('calcule la dernière échéance à partir de la première et de la durée', () => {
    expect(lastInstallmentDate(loan.firstInstallmentDate, loan.durationMonths)).toBe(
      loan.lastInstallmentDate,
    );
  });
});

describe('échéancier estimé', () => {
  const estimated = generateEstimatedSchedule(loan);

  it('a une échéance par mois et rembourse exactement le capital', () => {
    expect(estimated).toHaveLength(240);
    expect(estimated[0]!.date).toBe('2017-12-05');
    expect(estimated.at(-1)!.date).toBe('2037-11-05');
    expect(estimated.reduce((s, i) => s + i.principal, 0)).toBe(loan.principal);
    for (const i of estimated) {
      expect(Number.isInteger(i.principal) && Number.isInteger(i.interest)).toBe(true);
      expect(i.insurance).toBe(loan.monthlyInsurance);
    }
  });

  it('a une mensualité constante (hors dernière) : 821,24 € pour 170 190 € à 1,5 % sur 20 ans', () => {
    const payments = new Set(estimated.slice(0, -1).map((i) => i.principal + i.interest));
    expect([...payments]).toEqual([82124]);
  });

  it('reste proche du tableau de la banque (écart de capital restant dû < 1 %)', () => {
    const estimatedLoan = { ...loan, id: 'EST' };
    const est = estimated.map((i) => ({ ...i, loanId: 'EST' }));
    for (const date of ['2020-12-31', '2025-12-31', '2030-12-31']) {
      const a = outstandingPrincipal(loan, bank, date);
      const b = outstandingPrincipal(estimatedLoan, est, date);
      expect(Math.abs(a - b) / a).toBeLessThan(0.01);
    }
  });

  it('gère un taux nul et refuse une durée nulle', () => {
    const zero: Loan = { ...loan, annualRate: 0, durationMonths: 3, principal: 1000 };
    expect(generateEstimatedSchedule(zero).map((i) => i.principal)).toEqual([333, 333, 334]);
    expect(generateEstimatedSchedule({ ...loan, durationMonths: 0 })).toEqual([]);
  });
});

describe('lecture d’un tableau collé ou d’un CSV', () => {
  it('lit dates et montants au format français', () => {
    expect(parseDateCell('05/12/2017')).toBe('2017-12-05');
    expect(parseDateCell('5.1.18')).toBe('2018-01-05');
    expect(parseDateCell('2017-12-05')).toBe('2017-12-05');
    expect(parseDateCell('31/02/2020')).toBeNull();
    expect(parseDateCell('Date')).toBeNull();
    expect(parseAmountCell('170 190,00 €', true)).toBe(17019000);
    expect(parseAmountCell('1.234,56', true)).toBe(123456);
    expect(parseAmountCell('1234.56', true)).toBe(123456);
    expect(parseAmountCell('1,234.56', false)).toBe(123456);
    expect(parseAmountCell('', true)).toBe(0);
    expect(parseAmountCell('abc', true)).toBeNull();
  });

  /** Le tableau de la banque du jeu de test, tel que copié depuis Excel. */
  const pasted = [
    'Date\tCapital dû\tCapital\tIntérêts\tAssurance',
    ...bank.map((i) =>
      [
        i.date.split('-').reverse().join('/'),
        (i.principalBefore / 100).toFixed(2).replace('.', ','),
        (i.principal / 100).toFixed(2).replace('.', ','),
        (i.interest / 100).toFixed(2).replace('.', ','),
        (i.insurance / 100).toFixed(2).replace('.', ','),
      ].join('\t'),
    ),
  ].join('\r\n');

  it('retrouve exactement les 240 échéances du jeu de test (copier-coller Excel)', () => {
    const parsed = parseScheduleText(pasted, loan);
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.skippedLines).toEqual([1]);
    expect(parsed.installments).toEqual(bank);
  });

  it('lit un CSV à point-virgule avec une colonne numéro et un capital dû après échéance', () => {
    const csv = [
      'N°;Date;Capital restant dû;Capital;Intérêts;Assurance',
      '1;05/12/2017;"169 581,49";608,51;196,31;18,75',
      '2;05/01/2018;168 963,48;618,01;206,61;20,08',
    ].join('\n');
    const parsed = parseScheduleText(csv, loan);
    expect(parsed.errors).toEqual([]);
    expect(parsed.installments[0]).toMatchObject({
      number: 1,
      date: '2017-12-05',
      principalBefore: 17019000,
      principal: 60851,
      interest: 19631,
      insurance: 1875,
    });
    expect(parsed.installments[1]!.principalBefore).toBe(16958149);
    // Seulement 2 lignes : le capital ne correspond pas, on prévient.
    expect(parsed.warnings.length).toBe(2);
  });

  it('lit un CSV à virgule (point décimal)', () => {
    const parsed = parseScheduleText('2017-12-05,170190.00,608.51,196.31,18.75', loan);
    expect(parsed.installments[0]!.interest).toBe(19631);
  });

  it('refuse un texte sans échéance, ou un montant illisible', () => {
    expect(parseScheduleText('bonjour\nau revoir', loan).errors).toHaveLength(1);
    const bad = parseScheduleText('05/12/2017\t170190\tx\t1\t1', loan);
    expect(bad.errors[0]).toMatch(/Ligne 1/);
    expect(bad.installments).toEqual([]);
  });

  it('refuse des dates dans le désordre', () => {
    const parsed = parseScheduleText('05/01/2018;1;1;1;1\n05/12/2017;1;1;1;1', loan);
    expect(parsed.errors[0]).toMatch(/ordre croissant/);
  });
});
