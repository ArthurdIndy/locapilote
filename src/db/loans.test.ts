import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateEstimatedSchedule } from '../engine/core/loan';
import type { Loan } from '../engine/types';
import { LocapiloteDb } from './database';
import { startWithTestDataset } from './setup';

let db: LocapiloteDb;
let n = 0;

beforeEach(async () => {
  n += 1;
  db = new LocapiloteDb(`loans-${n}`);
  await startWithTestDataset(db);
});

afterEach(async () => {
  await db.delete();
});

const newLoan: Loan = {
  id: 'P2',
  propertyId: 'APPART-01',
  bank: 'Autre banque',
  label: 'Prêt travaux',
  principal: 1000000,
  annualRate: 0.03,
  durationMonths: 60,
  firstInstallmentDate: '2025-01-10',
  lastInstallmentDate: '2029-12-10',
  monthlyInsurance: 500,
};

describe('prêts dans la base', () => {
  it('le jeu de test charge son prêt et ses 240 échéances, venues de la banque', async () => {
    const loans = await db.loans.toArray();
    expect(loans).toHaveLength(1);
    expect(loans[0]!.scheduleSource ?? 'bank').toBe('bank');
    expect(await db.loanInstallments.where('loanId').equals('P1').count()).toBe(240);
  });

  it('refuse un prêt rattaché à un bien inconnu', async () => {
    await expect(db.saveLoan({ ...newLoan, propertyId: 'X' })).rejects.toThrow(/Bien inconnu/);
  });

  it('remplace un échéancier sans toucher aux autres prêts, et note qu’il est estimé', async () => {
    await db.saveLoan(newLoan);
    await db.replaceLoanSchedule('P2', generateEstimatedSchedule(newLoan), 'estimated');
    expect(await db.loanInstallments.where('loanId').equals('P2').count()).toBe(60);
    expect((await db.loans.get('P2'))!.scheduleSource).toBe('estimated');
    await db.replaceLoanSchedule(
      'P2',
      generateEstimatedSchedule({ ...newLoan, durationMonths: 12 }).map((i) => ({
        ...i,
        loanId: 'P2',
      })),
      'bank',
    );
    expect(await db.loanInstallments.where('loanId').equals('P2').count()).toBe(12);
    expect(await db.loanInstallments.where('loanId').equals('P1').count()).toBe(240);
  });

  it('supprime un prêt avec ses échéances', async () => {
    await db.deleteLoan('P1');
    expect(await db.loans.count()).toBe(0);
    expect(await db.loanInstallments.count()).toBe(0);
  });

  it('règle la date de mise à jour, en créant les hypothèses si besoin', async () => {
    await db.setDataAsOf('APPART-01', '2026-06-30');
    const a = await db.assumptions.get('APPART-01');
    expect(a!.dataAsOf).toBe('2026-06-30');
    expect(a!.saleScenarios).toHaveLength(3); // le reste est conservé
    await db.properties.put({ ...(await db.properties.get('APPART-01'))!, id: 'B2', name: 'B2' });
    await db.setDataAsOf('B2', '2026-01-31');
    expect((await db.assumptions.get('B2'))!.sale.incomeTaxRate).toBe(0.19);
  });
});
