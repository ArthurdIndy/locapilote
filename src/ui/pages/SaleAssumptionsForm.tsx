import { useState, type FormEvent } from 'react';
import { db } from '../../db/database';
import type { Property, PropertyAssumptions } from '../../engine/types';
import { DisclosureButton } from '../components/DisclosureButton';
import {
  centsToInput,
  formatDate,
  parseEurosInput,
  parsePercentInput,
  rateToInput,
} from '../format';
import { useOpenDetails } from '../openDetails';
import { propertyHref } from '../router';

type Kind = 'euros' | 'percent';

interface FieldDef {
  key: string;
  label: string;
  kind: Kind;
  help?: string;
  get: (a: PropertyAssumptions) => number;
  set: (a: PropertyAssumptions, value: number) => PropertyAssumptions;
}

const sale =
  <K extends keyof PropertyAssumptions['sale']>(key: K) =>
  (a: PropertyAssumptions, value: number): PropertyAssumptions => ({
    ...a,
    sale: { ...a.sale, [key]: value },
  });
const projection =
  <K extends keyof PropertyAssumptions['projection']>(key: K) =>
  (a: PropertyAssumptions, value: number): PropertyAssumptions => ({
    ...a,
    projection: { ...a.projection, [key]: value },
  });

const SALE_FIELDS: FieldDef[] = [
  {
    key: 'agencyFeesRate',
    label: 'Frais d’agence à ta charge (% du prix)',
    kind: 'percent',
    help: '0 % si l’acheteur les paie.',
    get: (a) => a.sale.agencyFeesRate,
    set: sale('agencyFeesRate'),
  },
  {
    key: 'otherSaleCosts',
    label: 'Frais divers de vente (€)',
    kind: 'euros',
    help: 'Diagnostics, état daté, mainlevée.',
    get: (a) => a.sale.otherSaleCosts,
    set: sale('otherSaleCosts'),
  },
  {
    key: 'earlyRepaymentPenalty',
    label: 'Indemnités de remboursement anticipé (€)',
    kind: 'euros',
    help: 'Souvent exclues en cas de vente : à vérifier dans l’offre de prêt.',
    get: (a) => a.sale.earlyRepaymentPenalty,
    set: sale('earlyRepaymentPenalty'),
  },
  {
    key: 'actualAcquisitionCosts',
    label: 'Frais d’acquisition réels justifiables (€)',
    kind: 'euros',
    help: 'Droits, émoluments du notaire, honoraires d’agence de l’achat. Le forfait de 7,5 % s’applique s’il est plus élevé.',
    get: (a) => a.sale.actualAcquisitionCosts,
    set: sale('actualAcquisitionCosts'),
  },
  {
    key: 'incomeTaxRate',
    label: 'Taux d’impôt sur le revenu sur la plus-value (%)',
    kind: 'percent',
    help: '19 % (taux légal).',
    get: (a) => a.sale.incomeTaxRate,
    set: sale('incomeTaxRate'),
  },
  {
    key: 'socialChargesRate',
    label: 'Taux des prélèvements sociaux sur la plus-value (%)',
    kind: 'percent',
    help: '17,2 % en 2026 pour les plus-values immobilières.',
    get: (a) => a.sale.socialChargesRate,
    set: sale('socialChargesRate'),
  },
];

const PROJECTION_FIELDS: FieldDef[] = [
  {
    key: 'avoidedRentMonthlyAtPurchase',
    label: 'Loyer évité à l’achat (€ / mois, charges comprises)',
    kind: 'euros',
    help: 'Ce que tu aurais payé pour louer un logement équivalent, tant que tu y habitais.',
    get: (a) => a.projection.avoidedRentMonthlyAtPurchase,
    set: projection('avoidedRentMonthlyAtPurchase'),
  },
  {
    key: 'avoidedRentIndexation',
    label: 'Indexation annuelle du loyer évité (%)',
    kind: 'percent',
    get: (a) => a.projection.avoidedRentIndexation,
    set: projection('avoidedRentIndexation'),
  },
  {
    key: 'netRentMonthly',
    label: 'Projection : loyer net perçu (€ / mois)',
    kind: 'euros',
    help: 'Loyer et provisions, moins les honoraires de gestion.',
    get: (a) => a.projection.netRentMonthly,
    set: projection('netRentMonthly'),
  },
  {
    key: 'annualExpensesExcludingLoan',
    label: 'Projection : dépenses payées par toi (€ / an, hors prêt)',
    kind: 'euros',
    get: (a) => a.projection.annualExpensesExcludingLoan,
    set: projection('annualExpensesExcludingLoan'),
  },
  {
    key: 'annualGrowth',
    label: 'Projection : évolution annuelle des loyers et des charges (%)',
    kind: 'percent',
    get: (a) => a.projection.annualGrowth,
    set: projection('annualGrowth'),
  },
  {
    key: 'depreciationDeductedPerYear',
    label: 'Amortissements déduits par an, années futures (€)',
    kind: 'euros',
    help: 'À demander au comptable : en général le résultat avant amortissements de l’année.',
    get: (a) => a.projection.depreciationDeductedPerYear,
    set: projection('depreciationDeductedPerYear'),
  },
  {
    key: 'saleYearCosts',
    label: 'Frais liés à l’année de la vente (€)',
    kind: 'euros',
    help: 'Par exemple la dernière liasse du comptable ; comptés à la vente.',
    get: (a) => a.projection.saleYearCosts,
    set: projection('saleYearCosts'),
  },
  {
    key: 'mainResidenceReinvestedShare',
    label: 'Part du prix réinvestie dans ta résidence principale (%)',
    kind: 'percent',
    help: 'Pour l’exonération pour remploi. Achat à deux : seule ta part compte.',
    get: (a) => a.projection.mainResidenceReinvestedShare,
    set: projection('mainResidenceReinvestedShare'),
  },
  {
    key: 'otherDebts',
    label: 'Autres dettes à rembourser à la vente (€)',
    kind: 'euros',
    help: 'Par exemple un prêt familial ayant servi à l’apport.',
    get: (a) => a.projection.otherDebts,
    set: projection('otherDebts'),
  },
];

const ALL_FIELDS = [...SALE_FIELDS, ...PROJECTION_FIELDS];

const toInput = (f: FieldDef, a: PropertyAssumptions) =>
  f.kind === 'euros' ? centsToInput(f.get(a)) : rateToInput(f.get(a));

/** Hypothèses de vente du bien, modifiables (détail replié ⊕, fermé par défaut). */
export function SaleAssumptionsForm({
  assumptions,
  property,
}: {
  assumptions: PropertyAssumptions;
  property: Property;
}) {
  const details = useOpenDetails('locapilote.vente.hypothesesOuvertes');
  const open = details.isOpen('hypotheses');
  const initial = () => Object.fromEntries(ALL_FIELDS.map((f) => [f.key, toInput(f, assumptions)]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  // Hypothèses d'un autre bien, ou modifiées ailleurs : on reprend les valeurs enregistrées.
  const [source, setSource] = useState(assumptions);
  if (source !== assumptions) {
    setSource(assumptions);
    setValues(initial());
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let next = assumptions;
    const problems: string[] = [];
    for (const f of ALL_FIELDS) {
      const text = values[f.key] ?? '';
      const parsed = f.kind === 'euros' ? parseEurosInput(text) : parsePercentInput(text);
      if (parsed === null || parsed < 0) {
        problems.push(`« ${f.label} » : ${f.kind === 'euros' ? 'montant' : 'taux'} invalide.`);
        continue;
      }
      next = f.set(next, parsed);
    }
    setErrors(problems);
    setMessage(null);
    if (problems.length > 0) return;
    await db.saveAssumptions(next);
    setMessage('Hypothèses enregistrées : les scénarios sont recalculés.');
  };

  const field = (f: FieldDef) => (
    <label key={f.key} className="field">
      <span>{f.label}</span>
      <input
        className="amount"
        inputMode="decimal"
        value={values[f.key] ?? ''}
        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
      />
      {f.help && <span className="muted small">{f.help}</span>}
    </label>
  );

  return (
    <section className="card stack" aria-label="Hypothèses de vente">
      <h3>
        <DisclosureButton
          label="Hypothèses de vente"
          open={open}
          onToggle={() => details.toggle('hypotheses')}
        />
      </h3>
      {!open ? (
        <p className="muted small">
          Frais de vente, taux d’imposition, loyer évité, projection après la date des données,
          remploi. Communes à tous les scénarios de ce bien.
        </p>
      ) : (
        <form className="form stack" onSubmit={submit} noValidate aria-label="Hypothèses de vente">
          <h4>Vente et plus-value</h4>
          <div className="assumptions-grid">{SALE_FIELDS.map(field)}</div>
          <h4>Bilan depuis l’achat et projection</h4>
          <div className="assumptions-grid">{PROJECTION_FIELDS.map(field)}</div>
          <p className="muted small">
            Fin d’occupation comme résidence principale :{' '}
            {property.mainResidenceEndDate
              ? formatDate(property.mainResidenceEndDate)
              : 'jamais (le bien n’a pas été ta résidence principale)'}
            . Elle se modifie dans <a href={propertyHref('informations')}>Mon bien</a>, comme le
            prix d’achat, le mobilier et l’apport.
          </p>
          {errors.length > 0 && (
            <ul className="error-text" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="button primary">
              Enregistrer les hypothèses
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
