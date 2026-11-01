/**
 * Base de données du navigateur (IndexedDB, via Dexie).
 *
 * Une table par type de données du modèle (`src/engine/types.ts`). Toute donnée porte
 * l'identifiant de son bien (`propertyId`), directement ou via son prêt.
 *
 * Versionnement : ne jamais modifier une version déjà publiée. Pour changer le schéma,
 * ajouter `this.version(N + 1).stores({...}).upgrade(...)` et augmenter `SCHEMA_VERSION`
 * (utilisé aussi par le format de sauvegarde, voir `backup.ts`).
 */
import Dexie, { type Table } from 'dexie';
import type {
  AccountantCarryforward,
  AccountantFiling,
  Asset,
  Category,
  Dataset,
  IsoDate,
  Loan,
  LoanInstallment,
  PreRentalExpense,
  Property,
  PropertyAssumptions,
  ScheduleSource,
  Transaction,
} from '../engine/types';
import { defaultAssumptions } from './defaultAssumptions';

export const SCHEMA_VERSION = 2;

export class LocapiloteDb extends Dexie {
  properties!: Table<Property, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  loans!: Table<Loan, string>;
  loanInstallments!: Table<LoanInstallment, [string, number]>;
  // Clé technique auto-incrémentée, gardée hors de l'objet (l'ordre de saisie est conservé).
  assets!: Table<Asset, number>;
  accountantCarryforwards!: Table<AccountantCarryforward, [string, number]>;
  accountantFilings!: Table<AccountantFiling, [string, number]>;
  preRentalExpenses!: Table<PreRentalExpense, number>;
  assumptions!: Table<PropertyAssumptions, string>;

  constructor(name = 'locapilote') {
    super(name);
    this.version(1).stores({
      properties: 'id',
      categories: 'id',
      transactions: 'id, propertyId, date, categoryId',
      loans: 'id, propertyId',
      loanInstallments: '[loanId+number], loanId',
      assets: '++, propertyId',
      accountantCarryforwards: '[propertyId+year], propertyId',
      preRentalExpenses: '++, propertyId',
      assumptions: 'propertyId',
    });
    // Version 2 (US09) : chaque immobilisation reçoit un identifiant (modification, suppression),
    // et les comptes déposés par le comptable ont leur table.
    this.version(2)
      .stores({
        assets: '++, propertyId, id',
        accountantFilings: '[propertyId+year], propertyId',
      })
      .upgrade(async (tx) => {
        await tx
          .table('assets')
          .toCollection()
          .modify((asset: Partial<Asset>) => {
            if (!asset.id) asset.id = crypto.randomUUID();
          });
      });
  }

  /** Les tables, dans l'ordre du `Dataset`. */
  get allTables() {
    return [
      this.properties,
      this.categories,
      this.transactions,
      this.loans,
      this.loanInstallments,
      this.assets,
      this.accountantCarryforwards,
      this.accountantFilings,
      this.preRentalExpenses,
      this.assumptions,
    ];
  }

  /** Lit toutes les données. */
  async readAll(): Promise<Dataset> {
    return this.transaction('r', this.allTables, async () => ({
      properties: await this.properties.toArray(),
      categories: await this.categories.toArray(),
      transactions: await this.transactions.toArray(),
      loans: await this.loans.toArray(),
      loanInstallments: await this.loanInstallments.toArray(),
      assets: await this.assets.toArray(),
      accountantCarryforwards: await this.accountantCarryforwards.toArray(),
      accountantFilings: await this.accountantFilings.toArray(),
      preRentalExpenses: await this.preRentalExpenses.toArray(),
      assumptions: await this.assumptions.toArray(),
    }));
  }

  /** Remplace toutes les données, d'un seul bloc (tout ou rien). */
  async replaceAll(data: Dataset): Promise<void> {
    await this.transaction('rw', this.allTables, async () => {
      await Promise.all(this.allTables.map((table) => table.clear()));
      await this.properties.bulkAdd(data.properties);
      await this.categories.bulkAdd(data.categories);
      await this.transactions.bulkAdd(data.transactions);
      await this.loans.bulkAdd(data.loans);
      await this.loanInstallments.bulkAdd(data.loanInstallments);
      await this.assets.bulkAdd(data.assets);
      await this.accountantCarryforwards.bulkAdd(data.accountantCarryforwards);
      await this.accountantFilings.bulkAdd(data.accountantFilings);
      await this.preRentalExpenses.bulkAdd(data.preRentalExpenses);
      await this.assumptions.bulkAdd(data.assumptions);
    });
  }

  /** Vrai si l'utilisateur a déjà fait son choix au premier lancement. */
  async isInitialized(): Promise<boolean> {
    return (await this.categories.count()) > 0 || (await this.properties.count()) > 0;
  }

  /** Enregistre un mouvement : vérifie que son bien et sa catégorie existent. */
  async saveTransaction(transaction: Transaction): Promise<void> {
    await this.transaction(
      'rw',
      [this.transactions, this.properties, this.categories],
      async () => {
        if (!(await this.properties.get(transaction.propertyId))) {
          throw new Error('Bien inconnu');
        }
        if (!(await this.categories.get(transaction.categoryId))) {
          throw new Error('Catégorie inconnue');
        }
        await this.transactions.put(transaction);
      },
    );
  }

  /** Enregistre un prêt (création ou modification) : vérifie que son bien existe. */
  async saveLoan(loan: Loan): Promise<void> {
    await this.transaction('rw', [this.loans, this.properties], async () => {
      if (!(await this.properties.get(loan.propertyId))) throw new Error('Bien inconnu');
      await this.loans.put(loan);
    });
  }

  /** Remplace tout l'échéancier d'un prêt, et note son origine (banque ou estimé). */
  async replaceLoanSchedule(
    loanId: string,
    installments: LoanInstallment[],
    source: ScheduleSource,
  ): Promise<void> {
    await this.transaction('rw', [this.loans, this.loanInstallments], async () => {
      const loan = await this.loans.get(loanId);
      if (!loan) throw new Error('Prêt inconnu');
      if (installments.some((i) => i.loanId !== loanId))
        throw new Error('Échéance d’un autre prêt');
      await this.loanInstallments.where('loanId').equals(loanId).delete();
      await this.loanInstallments.bulkAdd(installments);
      await this.loans.put({ ...loan, scheduleSource: source });
    });
  }

  /** Supprime un prêt et toutes ses échéances. */
  async deleteLoan(loanId: string): Promise<void> {
    await this.transaction('rw', [this.loans, this.loanInstallments], async () => {
      await this.loanInstallments.where('loanId').equals(loanId).delete();
      await this.loans.delete(loanId);
    });
  }

  /** Enregistre une immobilisation (création ou modification) : vérifie que son bien existe. */
  async saveAsset(asset: Asset): Promise<void> {
    await this.transaction('rw', [this.assets, this.properties], async () => {
      if (!(await this.properties.get(asset.propertyId))) throw new Error('Bien inconnu');
      const [key] = await this.assets.where('id').equals(asset.id).primaryKeys();
      if (key === undefined) await this.assets.add(asset);
      else await this.assets.put(asset, key);
    });
  }

  async deleteAsset(id: string): Promise<void> {
    await this.assets.where('id').equals(id).delete();
  }

  /**
   * Enregistre les comptes déposés d'une année et le stock d'amortissements reporté retenu
   * par le comptable (`null` = non saisi, on reprend alors le calcul de l'outil).
   */
  async saveAccountantYear(filing: AccountantFiling, carriedForward: number | null): Promise<void> {
    await this.transaction(
      'rw',
      [this.accountantFilings, this.accountantCarryforwards, this.properties],
      async () => {
        if (!(await this.properties.get(filing.propertyId))) throw new Error('Bien inconnu');
        const key: [string, number] = [filing.propertyId, filing.year];
        const empty =
          Object.keys(filing.amounts).length === 0 &&
          Object.values(filing.comments).every((c) => !c);
        if (empty) await this.accountantFilings.delete(key);
        else await this.accountantFilings.put(filing);
        if (carriedForward === null) await this.accountantCarryforwards.delete(key);
        else
          await this.accountantCarryforwards.put({
            propertyId: filing.propertyId,
            year: filing.year,
            carriedForward,
          });
      },
    );
  }

  /**
   * Règle la date de mise à jour des données d'un bien. Si le bien n'a pas encore
   * d'hypothèses, elles sont créées avec les valeurs par défaut.
   */
  async setDataAsOf(propertyId: string, dataAsOf: IsoDate): Promise<void> {
    await this.transaction('rw', [this.assumptions, this.properties], async () => {
      if (!(await this.properties.get(propertyId))) throw new Error('Bien inconnu');
      const current = (await this.assumptions.get(propertyId)) ?? defaultAssumptions(propertyId);
      await this.assumptions.put({ ...current, dataAsOf });
    });
  }
}

/** La base de l'application. */
export const db = new LocapiloteDb();
