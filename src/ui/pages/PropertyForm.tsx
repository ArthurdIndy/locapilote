import { useState, type FormEvent } from 'react';
import {
  COMPATIBLE_TAX_REGIMES,
  isTaxRegimeCompatible,
  RENTAL_TYPES,
  type Property,
  type RentalType,
  type TaxRegime,
} from '../../engine/types';
import { centsToInput, formatEuros, parseEurosInput } from '../format';
import { REGIME_LABELS, RENTAL_TYPE_LABELS } from '../labels';

/** Champs du formulaire, tels que saisis (texte). */
interface Fields {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  surfaceM2: string;
  rentalType: RentalType;
  /** Vide tant qu'aucun régime compatible n'est choisi. */
  taxRegime: TaxRegime | '';
  acquisitionDate: string;
  rentalStartDate: string;
  purchasePrice: string;
  furnitureIncluded: string;
  acquisitionAgencyFees: string;
  notaryAndGuaranteeFees: string;
  downPayment: string;
  rentExcludingCharges: string;
  chargesProvision: string;
  securityDeposit: string;
  estimatedValue: string;
  manager: string;
  syndic: string;
  mainResidenceEndDate: string;
}

const MONEY_FIELDS = [
  'purchasePrice',
  'furnitureIncluded',
  'acquisitionAgencyFees',
  'notaryAndGuaranteeFees',
  'downPayment',
  'rentExcludingCharges',
  'chargesProvision',
  'securityDeposit',
  'estimatedValue',
] as const;
type MoneyField = (typeof MONEY_FIELDS)[number];

function toFields(p: Property | null): Fields {
  const money = (c: number | undefined) => (c === undefined || c === 0 ? '' : centsToInput(c));
  return {
    name: p?.name ?? '',
    address: p?.address ?? '',
    postalCode: p?.postalCode ?? '',
    city: p?.city ?? '',
    surfaceM2: p?.surfaceM2 != null ? String(p.surfaceM2).replace('.', ',') : '',
    rentalType: p?.rentalType ?? 'furnished',
    taxRegime: p && isTaxRegimeCompatible(p.rentalType, p.taxRegime) ? p.taxRegime : '',
    acquisitionDate: p?.acquisitionDate ?? '',
    rentalStartDate: p?.rentalStartDate ?? '',
    purchasePrice: money(p?.purchasePrice),
    furnitureIncluded: money(p?.furnitureIncluded),
    acquisitionAgencyFees: money(p?.acquisitionAgencyFees),
    notaryAndGuaranteeFees: money(p?.notaryAndGuaranteeFees),
    downPayment: money(p?.downPayment),
    rentExcludingCharges: money(p?.rentExcludingCharges),
    chargesProvision: money(p?.chargesProvision),
    securityDeposit: money(p?.securityDeposit),
    estimatedValue: money(p?.estimatedValue),
    manager: p?.manager ?? '',
    syndic: p?.syndic ?? '',
    mainResidenceEndDate: p?.mainResidenceEndDate ?? '',
  };
}

/** Montant d'un champ (vide = 0), ou null si la saisie est invalide. */
function money(text: string) {
  return text.trim() === '' ? 0 : parseEurosInput(text);
}

/** Coût total d'acquisition = prix net vendeur (mobilier compris) + frais d'agence + frais de notaire et de garantie. */
function totalCost(f: Fields): number | null {
  const parts = [f.purchasePrice, f.acquisitionAgencyFees, f.notaryAndGuaranteeFees].map(money);
  return parts.some((p) => p === null) ? null : parts.reduce<number>((s, p) => s + (p ?? 0), 0);
}

interface Props {
  initial: Property | null;
  onSave: (property: Property) => Promise<void>;
  onCancel: (() => void) | null;
}

export function PropertyForm({ initial, onSave, onCancel }: Props) {
  const [fields, setFields] = useState<Fields>(() => toFields(initial));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const total = totalCost(fields);
  const [regimeCleared, setRegimeCleared] = useState(false);

  /** Changer le type de location vide le régime s'il n'est plus compatible. */
  const changeRentalType = (rentalType: RentalType) => {
    const cleared = fields.taxRegime !== '' && !isTaxRegimeCompatible(rentalType, fields.taxRegime);
    setFields((f) => ({ ...f, rentalType, taxRegime: cleared ? '' : f.taxRegime }));
    setRegimeCleared(cleared);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: string[] = [];
    const f = fields;
    if (!f.name.trim()) problems.push('Donne un nom au bien.');
    if (!f.taxRegime) problems.push('Choisis un régime fiscal.');
    if (!f.acquisitionDate) problems.push('Indique la date d’acquisition.');
    if (f.rentalStartDate && f.acquisitionDate && f.rentalStartDate < f.acquisitionDate) {
      problems.push('La mise en location ne peut pas précéder l’acquisition.');
    }
    const amounts = {} as Record<MoneyField, number>;
    for (const key of MONEY_FIELDS) {
      const value = money(f[key]);
      if (value === null || value < 0) problems.push(`Montant invalide : « ${f[key]} ».`);
      else amounts[key] = value;
    }
    if (problems.length === 0 && amounts.furnitureIncluded > amounts.purchasePrice) {
      problems.push('Le mobilier ne peut pas dépasser le prix d’achat (il y est inclus).');
    }
    const surface = f.surfaceM2.trim() === '' ? null : Number(f.surfaceM2.replace(',', '.'));
    if (surface !== null && !(surface > 0)) problems.push('Surface invalide.');
    setErrors(problems);
    if (problems.length > 0 || total === null || !f.taxRegime) return;

    const property: Property = {
      id: initial?.id ?? crypto.randomUUID(),
      name: f.name.trim(),
      address: f.address.trim(),
      postalCode: f.postalCode.trim() || null,
      city: f.city.trim(),
      rentalType: f.rentalType,
      taxRegime: f.taxRegime,
      acquisitionDate: f.acquisitionDate,
      purchasePrice: amounts.purchasePrice,
      furnitureIncluded: amounts.furnitureIncluded,
      acquisitionAgencyFees: amounts.acquisitionAgencyFees,
      notaryAndGuaranteeFees: amounts.notaryAndGuaranteeFees,
      totalAcquisitionCost: total,
      downPayment: amounts.downPayment,
      rentalStartDate: f.rentalStartDate || null,
      mainResidenceEndDate: f.mainResidenceEndDate || null,
      estimatedValue: amounts.estimatedValue,
      surfaceM2: surface,
      manager: f.manager.trim() || null,
      syndic: f.syndic.trim() || null,
      rentExcludingCharges: amounts.rentExcludingCharges,
      chargesProvision: amounts.chargesProvision,
      securityDeposit: amounts.securityDeposit,
    };
    setSaving(true);
    try {
      await onSave(property);
    } catch (e) {
      setErrors([`Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}`]);
      setSaving(false);
    }
  };

  const text = (key: keyof Fields, label: string, props: Record<string, string> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={fields[key]} onChange={(e) => set(key, e.target.value as never)} {...props} />
    </label>
  );
  const euros = (key: MoneyField, label: string) =>
    text(key, label, { inputMode: 'decimal', placeholder: '0,00', className: 'amount' });

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>{initial ? `Modifier « ${initial.name} »` : 'Nouveau bien'}</h2>

      <fieldset>
        <legend>Identité</legend>
        {text('name', 'Nom du bien *', { placeholder: 'Ex. : Studio centre-ville', required: '' })}
        {text('address', 'Adresse')}
        <div className="row">
          {text('postalCode', 'Code postal', { inputMode: 'numeric' })}
          {text('city', 'Ville')}
        </div>
        {text('surfaceM2', 'Surface (m²)', { inputMode: 'decimal' })}
      </fieldset>

      <fieldset>
        <legend>Location et fiscalité</legend>
        <div className="row">
          <label className="field">
            <span>Type de location</span>
            <select
              value={fields.rentalType}
              onChange={(e) => changeRentalType(e.target.value as RentalType)}
            >
              {RENTAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RENTAL_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Régime fiscal</span>
            <select
              value={fields.taxRegime}
              onChange={(e) => set('taxRegime', e.target.value as TaxRegime)}
              aria-invalid={fields.taxRegime === ''}
            >
              {fields.taxRegime === '' && <option value="">Choisir un régime…</option>}
              {COMPATIBLE_TAX_REGIMES[fields.rentalType].map((r) => (
                <option key={r} value={r}>
                  {REGIME_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          {text('acquisitionDate', 'Date d’acquisition *', { type: 'date' })}
          {text('rentalStartDate', 'Date de mise en location', { type: 'date' })}
        </div>
        {fields.taxRegime === '' && (
          <p className="warning" role="status">
            {regimeCleared
              ? 'Le régime choisi ne correspond pas à ce type de location : choisis-en un dans la liste.'
              : 'Choisis le régime fiscal du bien.'}
          </p>
        )}
        <p className="muted small">
          Meublée ou saisonnière : régimes LMNP ou LMP. Nue : micro-foncier ou réel foncier. Changer
          de régime ne demande aucune ressaisie : les mouvements restent les mêmes.
        </p>
      </fieldset>

      <fieldset>
        <legend>Achat</legend>
        <div className="row">
          {euros('purchasePrice', 'Prix d’achat net vendeur (€)')}
          {euros('furnitureIncluded', 'Dont mobilier (€)')}
        </div>
        <div className="row">
          {euros('acquisitionAgencyFees', 'Frais d’agence (€)')}
          {euros('notaryAndGuaranteeFees', 'Frais de notaire et de garantie (€)')}
        </div>
        <p className="computed">
          Coût total d’acquisition : <strong>{total === null ? '—' : formatEuros(total)}</strong>
          <span className="muted small"> (prix + frais d’agence + frais de notaire)</span>
        </p>
        {euros('downPayment', 'Apport (€)')}
      </fieldset>

      <details>
        <summary>Plus de détails (loyer, gestion, valeur estimée)</summary>
        <fieldset>
          <div className="row">
            {euros('rentExcludingCharges', 'Loyer mensuel hors charges (€)')}
            {euros('chargesProvision', 'Provision sur charges (€)')}
          </div>
          <div className="row">
            {euros('securityDeposit', 'Dépôt de garantie (€)')}
            {euros('estimatedValue', 'Valeur estimée (€)')}
          </div>
          <div className="row">
            {text('manager', 'Gestionnaire')}
            {text('syndic', 'Syndic')}
          </div>
          {text('mainResidenceEndDate', 'Fin de résidence principale (si elle l’a été)', {
            type: 'date',
          })}
        </fieldset>
      </details>

      {errors.length > 0 && (
        <ul className="error-text" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button type="submit" className="button primary" disabled={saving}>
          {initial ? 'Enregistrer' : 'Créer le bien'}
        </button>
        {onCancel && (
          <button type="button" className="button" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
