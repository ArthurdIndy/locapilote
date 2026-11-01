/**
 * Chargeur du jeu de test (`data/seed.json`) : convertit le format d'export de l'Excel
 * (clés en français, montants en euros) vers le modèle de Locapilote (centimes, codes en anglais).
 */
import { eurosToCents } from '../engine/money';
import type {
  Category,
  CategoryDirection,
  Dataset,
  IsoDate,
  Property,
  RentalType,
  TaxRegime,
  TaxTreatment,
} from '../engine/types';

// ---------- Format brut de data/seed.json ----------

interface RawProperty {
  id: string;
  nom: string;
  adresse: string;
  code_postal: string | null;
  ville: string;
  type_location: string;
  regime_fiscal: string;
  date_acquisition: string;
  prix_achat_net_vendeur: number;
  dont_mobilier: number;
  frais_agence_achat: number;
  frais_notaire_garantie: number;
  cout_total_acquisition: number;
  apport: number;
  date_mise_en_location: string | null;
  valeur_estimee: number;
  surface_m2: number | null;
  gestionnaire: string | null;
  syndic: string | null;
  loyer_hors_charges: number;
  provision_charges: number;
  depot_garantie: number;
  fin_residence_principale: string | null;
}

interface RawCategory {
  nom: string;
  sens: string;
  traitement_fiscal_lmnp_reel: string;
  groupe: string;
  signe_tresorerie: number;
  description: string;
}

interface RawTransaction {
  date: string;
  bien: string;
  compte: string;
  categorie: string;
  libelle: string;
  montant: number;
  piece: string | null;
  source: string | null;
  commentaire: string | null;
}

interface RawLoan {
  id: string;
  bien: string;
  banque: string;
  libelle: string;
  montant: number;
  taux_annuel: number;
  duree_mois: number;
  premiere_echeance: string;
  derniere_echeance: string;
  assurance_mensuelle: number;
}

interface RawInstallment {
  pret: string;
  numero: number;
  date: string;
  capital_du_avant: number;
  capital: number;
  interets: number;
  assurance: number;
}

export interface RawSeed {
  biens: RawProperty[];
  categories: RawCategory[];
  mouvements: RawTransaction[];
  prets: RawLoan[];
  echeances_pret: RawInstallment[];
  immobilisations: {
    bien: string;
    composant: string;
    mise_en_service: string;
    valeur: number;
    duree_annees: number;
  }[];
  stocks_amortissements_comptable: { bien: string; annee: number; stock_reporte: number }[];
  depenses_avant_location: {
    libelle: string;
    date: string;
    montant: number;
    bien: string;
    nature_source: string | null;
  }[];
  hypotheses: {
    revente: {
      frais_agence_pct_prix: number;
      frais_divers_vente: number;
      indemnites_remboursement_anticipe: number;
      frais_acquisition_reels: number;
      taux_ir_plus_value: number;
      taux_ps_plus_value: number;
    };
    projection: {
      loyer_evite_mensuel_a_l_achat: number;
      indexation_loyer_evite: number;
      loyer_net_agence_mensuel: number;
      depenses_annuelles_hors_pret: number;
      evolution_annuelle: number;
      amortissements_deduits_par_an: number;
      frais_annee_de_vente: number;
      part_prix_reinvestie_rp: number;
      autres_dettes: number;
    };
    scenarios_vente: { date: string; prix: number }[];
    date_donnees: string;
  };
}

// ---------- Correspondances des libellés ----------

const TAX_REGIMES: Record<string, TaxRegime> = {
  'LMNP réel': 'lmnp-reel',
  'LMNP micro-BIC': 'lmnp-micro-bic',
  'LMP réel': 'lmp-reel',
  'Micro-foncier': 'micro-foncier',
  'Réel foncier': 'reel-foncier',
};

const RENTAL_TYPES: Record<string, RentalType> = {
  Meublée: 'furnished',
  Saisonnière: 'seasonal',
  Nue: 'unfurnished',
};

const DIRECTIONS: Record<string, CategoryDirection> = {
  Recette: 'income',
  Dépense: 'expense',
  Transfert: 'transfer',
  Neutre: 'neutral',
};

const TAX_TREATMENTS: Record<string, TaxTreatment> = {
  Imposable: 'taxable',
  Déductible: 'deductible',
  'À amortir': 'depreciable',
  'À valider': 'to-review',
  'Non fiscal': 'non-taxable',
};

function lookup<T>(table: Record<string, T>, value: string, what: string): T {
  const found = table[value];
  if (found === undefined) {
    throw new Error(`${what} inconnu dans le jeu de test : « ${value} »`);
  }
  return found;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(value: string, what: string): IsoDate {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${what} : date invalide « ${value} » (attendu AAAA-MM-JJ)`);
  }
  return value;
}

function optionalIsoDate(value: string | null, what: string): IsoDate | null {
  return value === null ? null : isoDate(value, what);
}

// ---------- Conversion ----------

function toProperty(raw: RawProperty): Property {
  return {
    id: raw.id,
    name: raw.nom,
    address: raw.adresse,
    postalCode: raw.code_postal,
    city: raw.ville,
    rentalType: lookup(RENTAL_TYPES, raw.type_location, 'Type de location'),
    taxRegime: lookup(TAX_REGIMES, raw.regime_fiscal, 'Régime fiscal'),
    acquisitionDate: isoDate(raw.date_acquisition, 'Date d’acquisition'),
    purchasePrice: eurosToCents(raw.prix_achat_net_vendeur),
    furnitureIncluded: eurosToCents(raw.dont_mobilier),
    acquisitionAgencyFees: eurosToCents(raw.frais_agence_achat),
    notaryAndGuaranteeFees: eurosToCents(raw.frais_notaire_garantie),
    totalAcquisitionCost: eurosToCents(raw.cout_total_acquisition),
    downPayment: eurosToCents(raw.apport),
    rentalStartDate: optionalIsoDate(raw.date_mise_en_location, 'Mise en location'),
    mainResidenceEndDate: optionalIsoDate(
      raw.fin_residence_principale,
      'Fin de résidence principale',
    ),
    estimatedValue: eurosToCents(raw.valeur_estimee),
    surfaceM2: raw.surface_m2,
    manager: raw.gestionnaire,
    syndic: raw.syndic,
    rentExcludingCharges: eurosToCents(raw.loyer_hors_charges),
    chargesProvision: eurosToCents(raw.provision_charges),
    securityDeposit: eurosToCents(raw.depot_garantie),
  };
}

function toCategory(raw: RawCategory): Category {
  if (raw.signe_tresorerie !== 1 && raw.signe_tresorerie !== -1) {
    throw new Error(`Catégorie « ${raw.nom} » : signe de trésorerie invalide`);
  }
  return {
    // Le nom sert d'identifiant tant que les catégories ne sont pas éditables (US02).
    id: raw.nom,
    name: raw.nom,
    direction: lookup(DIRECTIONS, raw.sens, 'Sens'),
    taxTreatment: {
      'lmnp-reel': lookup(TAX_TREATMENTS, raw.traitement_fiscal_lmnp_reel, 'Traitement fiscal'),
    },
    group: raw.groupe,
    cashSign: raw.signe_tresorerie,
    description: raw.description,
  };
}

/** Convertit le jeu de test brut en `Dataset`, en vérifiant les références. */
export function parseSeed(raw: RawSeed): Dataset {
  const properties = raw.biens.map(toProperty);
  const categories = raw.categories.map(toCategory);
  const propertyIds = new Set(properties.map((p) => p.id));
  const categoryIds = new Set(categories.map((c) => c.id));

  const checkProperty = (id: string, where: string): string => {
    if (!propertyIds.has(id)) throw new Error(`${where} : bien inconnu « ${id} »`);
    return id;
  };

  const transactions = raw.mouvements.map((m, index) => {
    if (!categoryIds.has(m.categorie)) {
      throw new Error(`Mouvement ${index + 1} : catégorie inconnue « ${m.categorie} »`);
    }
    return {
      id: `T${String(index + 1).padStart(4, '0')}`,
      propertyId: checkProperty(m.bien, `Mouvement ${index + 1}`),
      date: isoDate(m.date, `Mouvement ${index + 1}`),
      account: m.compte,
      categoryId: m.categorie,
      label: m.libelle,
      amount: eurosToCents(m.montant),
      document: m.piece,
      source: m.source,
      comment: m.commentaire,
    };
  });

  const loans = raw.prets.map((l) => ({
    id: l.id,
    propertyId: checkProperty(l.bien, `Prêt ${l.id}`),
    bank: l.banque,
    label: l.libelle,
    principal: eurosToCents(l.montant),
    annualRate: l.taux_annuel,
    durationMonths: l.duree_mois,
    firstInstallmentDate: isoDate(l.premiere_echeance, `Prêt ${l.id}`),
    lastInstallmentDate: isoDate(l.derniere_echeance, `Prêt ${l.id}`),
    monthlyInsurance: eurosToCents(l.assurance_mensuelle),
  }));
  const loanIds = new Set(loans.map((l) => l.id));

  const loanInstallments = raw.echeances_pret.map((e) => {
    if (!loanIds.has(e.pret)) throw new Error(`Échéance ${e.numero} : prêt inconnu « ${e.pret} »`);
    return {
      loanId: e.pret,
      number: e.numero,
      date: isoDate(e.date, `Échéance ${e.numero}`),
      principalBefore: eurosToCents(e.capital_du_avant),
      principal: eurosToCents(e.capital),
      interest: eurosToCents(e.interets),
      insurance: eurosToCents(e.assurance),
    };
  });

  const assets = raw.immobilisations.map((a) => ({
    propertyId: checkProperty(a.bien, `Immobilisation ${a.composant}`),
    component: a.composant,
    inServiceDate: isoDate(a.mise_en_service, `Immobilisation ${a.composant}`),
    value: eurosToCents(a.valeur),
    durationYears: a.duree_annees,
  }));

  const accountantCarryforwards = raw.stocks_amortissements_comptable.map((s) => ({
    propertyId: checkProperty(s.bien, `Stock ${s.annee}`),
    year: s.annee,
    carriedForward: eurosToCents(s.stock_reporte),
  }));

  const preRentalExpenses = raw.depenses_avant_location.map((d) => ({
    propertyId: checkProperty(d.bien, `Dépense « ${d.libelle} »`),
    label: d.libelle,
    date: isoDate(d.date, `Dépense « ${d.libelle} »`),
    amount: eurosToCents(d.montant),
    sourceNote: d.nature_source,
  }));

  // Dans le jeu de test, les hypothèses sont globales : on les rattache à l'unique bien.
  const [firstProperty] = properties;
  if (properties.length !== 1 || firstProperty === undefined) {
    throw new Error('Le jeu de test doit contenir exactement un bien');
  }
  const h = raw.hypotheses;
  const assumptions = [
    {
      propertyId: firstProperty.id,
      sale: {
        agencyFeesRate: h.revente.frais_agence_pct_prix,
        otherSaleCosts: eurosToCents(h.revente.frais_divers_vente),
        earlyRepaymentPenalty: eurosToCents(h.revente.indemnites_remboursement_anticipe),
        actualAcquisitionCosts: eurosToCents(h.revente.frais_acquisition_reels),
        incomeTaxRate: h.revente.taux_ir_plus_value,
        socialChargesRate: h.revente.taux_ps_plus_value,
      },
      projection: {
        avoidedRentMonthlyAtPurchase: eurosToCents(h.projection.loyer_evite_mensuel_a_l_achat),
        avoidedRentIndexation: h.projection.indexation_loyer_evite,
        netRentMonthly: eurosToCents(h.projection.loyer_net_agence_mensuel),
        annualExpensesExcludingLoan: eurosToCents(h.projection.depenses_annuelles_hors_pret),
        annualGrowth: h.projection.evolution_annuelle,
        depreciationDeductedPerYear: eurosToCents(h.projection.amortissements_deduits_par_an),
        saleYearCosts: eurosToCents(h.projection.frais_annee_de_vente),
        mainResidenceReinvestedShare: h.projection.part_prix_reinvestie_rp,
        otherDebts: eurosToCents(h.projection.autres_dettes),
      },
      saleScenarios: h.scenarios_vente.map((s) => ({
        date: isoDate(s.date, 'Scénario de vente'),
        price: eurosToCents(s.prix),
      })),
      dataAsOf: isoDate(h.date_donnees, 'Date des données'),
    },
  ];

  return {
    properties,
    categories,
    transactions,
    loans,
    loanInstallments,
    assets,
    accountantCarryforwards,
    preRentalExpenses,
    assumptions,
  };
}
