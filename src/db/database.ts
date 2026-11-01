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
  Asset,
  Category,
  Dataset,
  Loan,
  LoanInstallment,
  PreRentalExpense,
  Property,
  PropertyAssumptions,
  Transaction,
} from '../engine/types';

export const SCHEMA_VERSION = 1;

export class LocapiloteDb extends Dexie {
  properties!: Table<Property, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  loans!: Table<Loan, string>;
  loanInstallments!: Table<LoanInstallment, [string, number]>;
  // Clé technique auto-incrémentée, gardée hors de l'objet (l'ordre de saisie est conservé).
  assets!: Table<Asset, number>;
  accountantCarryforwards!: Table<AccountantCarryforward, [string, number]>;
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
}

/** La base de l'application. */
export const db = new LocapiloteDb();
