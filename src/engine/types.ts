/**
 * Modèle de données de Locapilote.
 *
 * Conventions :
 * - montants en centimes entiers (`Cents`) ; conversion en euros seulement à l'affichage ;
 * - dates en chaînes ISO `AAAA-MM-JJ` (`IsoDate`), comparables directement entre elles ;
 * - taux en nombre décimal (0.015 pour 1,5 %) ;
 * - toute donnée est rattachée à un bien (`propertyId`).
 */

/** Montant en centimes entiers (ex. 1 054,89 € → 105489). */
export type Cents = number;

/** Date au format `AAAA-MM-JJ`, sans heure ni fuseau horaire. */
export type IsoDate = string;

/** Régimes fiscaux. Le calcul fiscal de chacun vit dans `src/engine/tax/`. */
export const TAX_REGIMES = [
  'lmnp-reel',
  'lmnp-micro-bic',
  'micro-foncier',
  'reel-foncier',
] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

export type RentalType = 'furnished' | 'unfurnished';

export interface Property {
  id: string;
  name: string;
  address: string;
  postalCode: string | null;
  city: string;
  rentalType: RentalType;
  taxRegime: TaxRegime;
  acquisitionDate: IsoDate;
  /** Prix d'achat net vendeur, mobilier compris. */
  purchasePrice: Cents;
  /** Part du prix d'achat correspondant au mobilier. */
  furnitureIncluded: Cents;
  acquisitionAgencyFees: Cents;
  notaryAndGuaranteeFees: Cents;
  totalAcquisitionCost: Cents;
  downPayment: Cents;
  rentalStartDate: IsoDate | null;
  /** Fin de l'occupation comme résidence principale, si le bien l'a été. */
  mainResidenceEndDate: IsoDate | null;
  estimatedValue: Cents;
  surfaceM2: number | null;
  manager: string | null;
  syndic: string | null;
  rentExcludingCharges: Cents;
  chargesProvision: Cents;
  securityDeposit: Cents;
}

/** Sens d'une catégorie : recette, dépense, transfert entre comptes, ou neutre (dépôt de garantie). */
export type CategoryDirection = 'income' | 'expense' | 'transfer' | 'neutral';

/** Traitement fiscal d'une catégorie pour un régime donné. */
export type TaxTreatment =
  | 'taxable' // Imposable
  | 'deductible' // Déductible
  | 'depreciable' // À amortir
  | 'to-review' // À valider
  | 'non-taxable'; // Non fiscal

export interface Category {
  id: string;
  name: string;
  direction: CategoryDirection;
  /** Traitement fiscal par régime ; un régime absent n'est pas encore paramétré. */
  taxTreatment: Partial<Record<TaxRegime, TaxTreatment>>;
  /** Groupe de synthèse (Loyers, Copropriété…). */
  group: string;
  /** +1 si l'argent entre sur le compte, −1 s'il en sort. */
  cashSign: 1 | -1;
  description: string;
}

/** Mouvement : une ligne du journal. */
export interface Transaction {
  id: string;
  propertyId: string;
  date: IsoDate;
  /** Compte concerné (banque, agence…). */
  account: string;
  categoryId: string;
  label: string;
  /** Positif ; négatif seulement pour une annulation ou une remise. */
  amount: Cents;
  document: string | null;
  source: string | null;
  comment: string | null;
}

export interface Loan {
  id: string;
  propertyId: string;
  bank: string;
  label: string;
  principal: Cents;
  annualRate: number;
  durationMonths: number;
  firstInstallmentDate: IsoDate;
  lastInstallmentDate: IsoDate;
  monthlyInsurance: Cents;
}

/** Échéance de prêt, telle que donnée par l'échéancier de la banque (il fait foi). */
export interface LoanInstallment {
  loanId: string;
  number: number;
  date: IsoDate;
  /** Capital dû avant l'échéance, tel qu'imprimé par la banque (informatif). */
  principalBefore: Cents;
  principal: Cents;
  interest: Cents;
  insurance: Cents;
}

/** Immobilisation amortissable (ou non, si la durée vaut 0). */
export interface Asset {
  propertyId: string;
  component: string;
  inServiceDate: IsoDate;
  value: Cents;
  /** Durée d'amortissement en années ; 0 = non amorti. */
  durationYears: number;
}

/** Stock d'amortissements reporté retenu par le comptable pour une année (il fait foi). */
export interface AccountantCarryforward {
  propertyId: string;
  year: number;
  carriedForward: Cents;
}

/** Dépense payée avant la mise en location (pour le bilan depuis l'achat). */
export interface PreRentalExpense {
  propertyId: string;
  label: string;
  date: IsoDate;
  amount: Cents;
  sourceNote: string | null;
}

export interface SaleAssumptions {
  agencyFeesRate: number;
  otherSaleCosts: Cents;
  earlyRepaymentPenalty: Cents;
  actualAcquisitionCosts: Cents;
  incomeTaxRate: number;
  socialChargesRate: number;
}

export interface ProjectionAssumptions {
  avoidedRentMonthlyAtPurchase: Cents;
  avoidedRentIndexation: number;
  netRentMonthly: Cents;
  annualExpensesExcludingLoan: Cents;
  annualGrowth: number;
  depreciationDeductedPerYear: Cents;
  saleYearCosts: Cents;
  mainResidenceReinvestedShare: number;
  otherDebts: Cents;
}

export interface SaleScenario {
  date: IsoDate;
  price: Cents;
}

/** Hypothèses de simulation d'un bien. */
export interface PropertyAssumptions {
  propertyId: string;
  sale: SaleAssumptions;
  projection: ProjectionAssumptions;
  saleScenarios: SaleScenario[];
  /** Date de mise à jour des données : au-delà, on projette. */
  dataAsOf: IsoDate;
}

/** L'ensemble des données d'un utilisateur. */
export interface Dataset {
  properties: Property[];
  categories: Category[];
  transactions: Transaction[];
  loans: Loan[];
  loanInstallments: LoanInstallment[];
  assets: Asset[];
  accountantCarryforwards: AccountantCarryforward[];
  preRentalExpenses: PreRentalExpense[];
  assumptions: PropertyAssumptions[];
}
