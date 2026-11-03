import { Fragment, useState, type FormEvent } from 'react';
import { db } from '../../db/database';
import { effectiveDataAsOf } from '../../db/defaultAssumptions';
import {
  isSaleSimulation,
  simulateSale,
  waitingYieldBetween,
  type ReferenceInvestment,
  type SaleSimulation,
} from '../../engine/sale-simulation';
import type { Dataset, Property, SaleScenario } from '../../engine/types';
import { DisclosureButton } from '../components/DisclosureButton';
import {
  centsToInput,
  formatDate,
  formatEuros,
  formatPercent,
  isPlausibleDate,
  parseEurosInput,
} from '../format';
import { useOpenDetails } from '../openDetails';
import { propertyHref, routeHref } from '../router';
import { assumptionsOf, referenceInvestment } from '../saleSummary';
import { SaleAssumptionsForm } from './SaleAssumptionsForm';
import { SaleDisclaimer } from './SaleDisclaimer';

interface Props {
  data: Dataset;
  property: Property;
  today: string;
}

const euros = (cents: number | null) => (cents === null ? '—' : formatEuros(Math.round(cents)));
const percent = (rate: number | null) => (rate === null ? '—' : formatPercent(rate));
const minus = (cents: number) => euros(cents === 0 ? 0 : -cents);

/** Un scénario calculé, avec sa place dans la liste enregistrée (pour le modifier). */
interface Column {
  index: number;
  sim: SaleSimulation;
  /** Rendement de l'attente par rapport au scénario précédent (par date). */
  waiting: number | null;
  first: boolean;
}

interface Row {
  label: string;
  value: (c: Column) => string;
  strong?: boolean;
  signed?: (c: Column) => number;
  details?: { id: string; rows: Row[] };
  help?: string;
  /** Note courte affichée sous la ligne (détail déplié). */
  note?: string;
}

/** Les amortissements réintégrés sont le total déduit (comme l'Excel de référence). */
const DEPRECIATION_NOTE =
  'Inclut les amortissements de tous les composants (mobilier, équipements, travaux) ; selon la notice 2048-IMM, seuls ceux du logement sont à réintégrer : à confirmer avec le notaire.';

interface Section {
  title: string;
  rows: Row[];
}

const REINVESTMENT_LABEL = {
  met: 'Oui',
  'not-met': 'Non',
  'not-applicable': 'Sans objet',
} as const;

function buildSections(reference: ReferenceInvestment | null, hasTaxModule: boolean): Section[] {
  const gain = (c: Column) => c.sim.capitalGain;
  const taxDetails: Row[] = hasTaxModule
    ? [
        { label: 'Durée de détention', value: (c) => `${gain(c)!.holdingYears} ans` },
        {
          label: 'Prix de cession (prix − frais de vente)',
          value: (c) => euros(gain(c)!.netSalePrice),
        },
        {
          label: 'Prix d’achat du logement (hors mobilier)',
          value: (c) => euros(gain(c)!.purchasePrice),
        },
        {
          label: '+ Frais d’acquisition (réels ou forfait 7,5 %)',
          value: (c) =>
            `${euros(gain(c)!.acquisitionCosts)}${gain(c)!.acquisitionCostsIsFlat ? ' (forfait)' : ''}`,
        },
        {
          label: '+ Forfait travaux 15 % (plus de 5 ans)',
          value: (c) => euros(gain(c)!.worksAllowance),
        },
        {
          label: '− Amortissements déduits à réintégrer',
          value: (c) => minus(gain(c)!.depreciationDeducted),
          note: DEPRECIATION_NOTE,
        },
        { label: 'Prix d’acquisition corrigé', value: (c) => euros(gain(c)!.adjustedCost) },
        { label: 'Plus-value brute', value: (c) => euros(gain(c)!.grossGain) },
        {
          label: 'Abattement pour durée de détention (impôt sur le revenu)',
          value: (c) => percent(gain(c)!.incomeTaxAllowance),
        },
        {
          label: 'Abattement pour durée de détention (prélèvements sociaux)',
          value: (c) => percent(gain(c)!.socialChargesAllowance),
        },
        { label: 'Impôt sur le revenu', value: (c) => euros(gain(c)!.incomeTax) },
        { label: 'Prélèvements sociaux', value: (c) => euros(gain(c)!.socialCharges) },
        {
          label: 'Surtaxe (plus-value imposable > 50 000 €)',
          value: (c) => (gain(c)!.surtaxApplies ? 'À calculer (non comptée)' : 'Non'),
        },
      ]
    : [];
  return [
    {
      title: 'Somme perçue',
      rows: [
        { label: 'Prix de vente', value: (c) => euros(c.sim.proceeds.price) },
        { label: '− Frais d’agence', value: (c) => minus(c.sim.proceeds.agencyFees) },
        { label: '− Frais divers de vente', value: (c) => minus(c.sim.proceeds.otherSaleCosts) },
        { label: '− Capital restant dû', value: (c) => minus(c.sim.proceeds.outstandingPrincipal) },
        {
          label: '− Indemnités de remboursement anticipé',
          value: (c) => minus(c.sim.proceeds.earlyRepaymentPenalty),
        },
        {
          label: '− Impôt sur la plus-value',
          value: (c) => (c.sim.capitalGain ? minus(c.sim.tax) : 'non calculé'),
          ...(hasTaxModule ? { details: { id: 'plus-value', rows: taxDetails } } : {}),
        },
        {
          label: 'Somme nette perçue',
          value: (c) => euros(c.sim.netProceeds),
          strong: true,
        },
        { label: '− Autres dettes à rembourser', value: (c) => minus(c.sim.otherDebts) },
        {
          label: 'Somme disponible pour le prochain achat',
          value: (c) => euros(c.sim.available),
        },
      ],
    },
    {
      title: 'Exonération pour remploi',
      rows: [
        {
          label: 'Condition des 4 ans',
          value: (c) => {
            const r = c.sim.reinvestment;
            if (r.condition === 'not-met' && r.eligibleFrom)
              return `Non (dès le ${formatDate(r.eligibleFrom)})`;
            return REINVESTMENT_LABEL[r.condition];
          },
        },
        {
          label: 'Impôt évité si le prix est réinvesti',
          value: (c) => euros(c.sim.reinvestment.avoidedTax),
        },
        {
          label: 'Somme nette avec remploi',
          value: (c) => euros(c.sim.netWithReinvestment),
          strong: true,
        },
      ],
    },
    {
      title: 'D’ici la vente',
      rows: [
        {
          label: 'Mois entre la mise à jour et la vente',
          value: (c) => String(c.sim.balance.monthsUntilSale),
        },
        {
          label: 'Cash-flow à remettre d’ici la vente',
          value: (c) => euros(c.sim.balance.cashFlowUntilSale),
          signed: (c) => c.sim.balance.cashFlowUntilSale,
          strong: true,
        },
        {
          label: 'Soit par mois',
          value: (c) =>
            c.sim.balance.monthsUntilSale > 0
              ? euros(c.sim.balance.cashFlowUntilSale / c.sim.balance.monthsUntilSale)
              : '—',
          signed: (c) => c.sim.balance.cashFlowUntilSale,
        },
        {
          label: 'Capital remboursé sur la période',
          value: (c) => euros(c.sim.balance.principalRepaidUntilSale),
        },
      ],
    },
    {
      title: 'Bilan depuis l’achat',
      rows: [
        {
          label: 'Gain total depuis l’achat',
          value: (c) => euros(c.sim.balance.totalGain),
          signed: (c) => c.sim.balance.totalGain,
          strong: true,
        },
        {
          label: 'TRI (rendement annuel de ton apport)',
          value: (c) => percent(c.sim.balance.irr),
          strong: true,
        },
        {
          label: reference
            ? `Gain par rapport au placement (${reference.label ? `${reference.label}, ` : ''}${formatPercent(reference.rate)})`
            : 'Gain par rapport au placement',
          value: (c) => (reference ? euros(c.sim.gainOverReference) : 'à renseigner'),
          signed: (c) => c.sim.gainOverReference ?? 0,
          strong: true,
        },
        {
          label: 'Rendement annuel de l’attente',
          value: (c) => (c.first ? '—' : percent(c.waiting)),
          help: 'Gain en plus par rapport au scénario précédent, rapporté à la somme nette que tu aurais touchée en vendant plus tôt, par année d’attente. À comparer au taux de ton futur prêt ou au placement.',
        },
      ],
    },
  ];
}

function signClass(row: Row, c: Column): string | undefined {
  if (!row.signed) return undefined;
  const v = Math.round(row.signed(c));
  return v < 0 ? 'negative' : v > 0 ? 'positive' : undefined;
}

type Editing = { mode: 'new' } | { mode: 'edit'; index: number } | null;

/** Simulations › Vente : comparer plusieurs dates et prix de vente (US11). */
export function SalePage({ data, property, today }: Props) {
  const details = useOpenDetails('locapilote.vente.detailsOuverts');
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);

  const assumptions = assumptionsOf(data, property);
  const asOf = effectiveDataAsOf(data.assumptions, property.id, today);
  const reference = referenceInvestment(data);
  const scenarios = assumptions.saleScenarios;

  const results = scenarios.map((scenario, index) => ({
    index,
    scenario,
    result: simulateSale(data, property, assumptions, asOf.date, scenario, reference),
  }));
  const valid = results
    .filter((r) => isSaleSimulation(r.result))
    .map((r) => ({ index: r.index, sim: r.result as SaleSimulation }))
    .sort((a, b) => a.sim.scenario.date.localeCompare(b.sim.scenario.date) || a.index - b.index);
  const columns: Column[] = valid.map((v, i) => ({
    ...v,
    first: i === 0,
    waiting: i === 0 ? null : waitingYieldBetween(valid[i - 1]!.sim, v.sim),
  }));
  const invalid = results.filter((r) => !isSaleSimulation(r.result));
  const hasTaxModule = columns.some((c) => c.sim.capitalGain !== null);
  const sections = buildSections(reference, hasTaxModule);
  const surtax = columns.some((c) => c.sim.capitalGain?.surtaxApplies);

  const saveScenarios = (next: SaleScenario[]) =>
    db.saveAssumptions({ ...assumptions, saleScenarios: next });

  const remove = async (index: number) => {
    const s = scenarios[index]!;
    const ok = window.confirm(
      `Supprimer le scénario de vente du ${formatDate(s.date)} (${formatEuros(s.price)}) ?`,
    );
    if (!ok) return;
    await saveScenarios(scenarios.filter((_, i) => i !== index));
    if (editing?.mode === 'edit') setEditing(null);
    setMessage(`Scénario du ${formatDate(s.date)} supprimé.`);
  };

  const startEdit = (next: Editing) => {
    setMessage(null);
    setEditing(next);
  };

  const scenarioName = (c: Column) => `du ${formatDate(c.sim.scenario.date)}`;

  const actions = (c: Column) => (
    <span className="scenario-actions">
      <button
        type="button"
        className="button small"
        aria-label={`Modifier le scénario ${scenarioName(c)}`}
        onClick={() => startEdit({ mode: 'edit', index: c.index })}
      >
        Modifier
      </button>
      <button
        type="button"
        className="button small danger"
        aria-label={`Supprimer le scénario ${scenarioName(c)}`}
        onClick={() => remove(c.index)}
      >
        Supprimer
      </button>
    </span>
  );

  return (
    <div className="stack">
      <div className="toolbar">
        <h3>Vente</h3>
        {!editing && (
          <button
            type="button"
            className="button primary"
            onClick={() => startEdit({ mode: 'new' })}
          >
            Ajouter un scénario
          </button>
        )}
      </div>
      <p className="muted small">
        Compare plusieurs dates et prix de vente : ce que tu toucherais, l’impôt sur la plus-value,
        ce qu’il faudra remettre d’ici là, et ce que le bien t’aura rapporté depuis l’achat. Données
        réelles jusqu’au {formatDate(asOf.date)}, projection au-delà (hypothèses ci-dessous).
      </p>

      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}

      {editing && (
        <ScenarioForm
          key={editing.mode === 'edit' ? editing.index : 'new'}
          property={property}
          initial={editing.mode === 'edit' ? scenarios[editing.index]! : null}
          onCancel={() => setEditing(null)}
          onSave={async (scenario) => {
            const next =
              editing.mode === 'edit'
                ? scenarios.map((s, i) => (i === editing.index ? scenario : s))
                : [...scenarios, scenario];
            await saveScenarios(next);
            setEditing(null);
            setMessage(
              editing.mode === 'edit'
                ? `Scénario du ${formatDate(scenario.date)} modifié.`
                : `Scénario du ${formatDate(scenario.date)} ajouté.`,
            );
          }}
        />
      )}

      {property.taxRegime !== 'lmnp-reel' && (
        <p className="card warning">
          Le calcul de l’impôt sur la plus-value n’est pas encore disponible pour le régime de ce
          bien : il est compté à 0 dans la somme nette et le TRI.
        </p>
      )}

      {invalid.length > 0 && (
        <div className="card warning">
          {invalid.map((r) => (
            <p key={r.index}>
              Le scénario du {formatDate(r.scenario.date)} précède la date d’acquisition du bien (
              {formatDate(property.acquisitionDate)}) : il n’est pas calculé.{' '}
              <button type="button" className="button small danger" onClick={() => remove(r.index)}>
                Supprimer
              </button>
            </p>
          ))}
        </div>
      )}

      {columns.length === 0 ? (
        <p className="card muted">
          Aucun scénario de vente pour l’instant. Clique sur « Ajouter un scénario » et indique une
          date et un prix de vente.
        </p>
      ) : (
        <>
          {/* Grand écran : un tableau, une colonne par scénario. */}
          <div className="synthesis-wide">
            <table className="synthesis-table sale-table" aria-label="Scénarios de vente">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Indicateur</span>
                  </th>
                  {columns.map((c) => (
                    <th key={c.index} scope="col">
                      <span className="scenario-head">
                        <span>Vente le {formatDate(c.sim.scenario.date)}</span>
                        <span className="muted small">{formatEuros(c.sim.scenario.price)}</span>
                      </span>
                      {actions(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              {sections.map((section) => (
                <tbody key={section.title}>
                  <tr className="section-row">
                    <th scope="rowgroup" colSpan={columns.length + 1}>
                      {section.title}
                    </th>
                  </tr>
                  {section.rows.map((row) => (
                    <Fragment key={row.label}>
                      <tr className={row.strong ? 'strong' : undefined}>
                        <th scope="row" title={row.help}>
                          <RowLabel row={row} details={details} />
                        </th>
                        {columns.map((c) => (
                          <td key={c.index} className={signClass(row, c)}>
                            {row.value(c)}
                          </td>
                        ))}
                      </tr>
                      {row.details &&
                        details.isOpen(row.details.id) &&
                        row.details.rows.map((d) => (
                          <Fragment key={d.label}>
                            <tr className="detail">
                              <th scope="row">{d.label}</th>
                              {columns.map((c) => (
                                <td key={c.index}>{d.value(c)}</td>
                              ))}
                            </tr>
                            {d.note && (
                              <tr className="detail detail-note">
                                <td colSpan={columns.length + 1}>{d.note}</td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                    </Fragment>
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          {/* Téléphone : une carte par scénario. */}
          <div className="synthesis-narrow stack">
            {columns.map((c) => (
              <section
                key={c.index}
                className="card year-card"
                aria-label={`Scénario ${scenarioName(c)}`}
              >
                <h3>Vente le {formatDate(c.sim.scenario.date)}</h3>
                <p className="muted">Prix : {formatEuros(c.sim.scenario.price)}</p>
                {sections.map((section) => (
                  <div key={section.title}>
                    <h4>{section.title}</h4>
                    <dl className="year-lines">
                      {section.rows.map((row) => (
                        <Fragment key={row.label}>
                          <div className={row.strong ? 'strong' : undefined}>
                            <dt>
                              <RowLabel row={row} details={details} />
                            </dt>
                            <dd className={signClass(row, c)}>{row.value(c)}</dd>
                          </div>
                          {row.details &&
                            details.isOpen(row.details.id) &&
                            row.details.rows.map((d) => (
                              <Fragment key={d.label}>
                                <div className="detail">
                                  <dt>{d.label}</dt>
                                  <dd>{d.value(c)}</dd>
                                </div>
                                {d.note && (
                                  <div className="detail detail-note">
                                    <dt>{d.note}</dt>
                                  </div>
                                )}
                              </Fragment>
                            ))}
                        </Fragment>
                      ))}
                    </dl>
                  </div>
                ))}
                <div className="actions">{actions(c)}</div>
              </section>
            ))}
          </div>

          <ul className="muted small notes">
            {!reference && (
              <li>
                Pour comparer à un placement (fonds euros, ETF…), renseigne son taux dans{' '}
                <a href={routeHref('parametres')}>⚙ Paramètres</a>.
              </li>
            )}
            {reference && (
              <li>
                Gain par rapport au placement : ce que le bien t’a rapporté de plus (ou de moins) à
                la date de vente que si chaque somme versée ou reçue avait été placée à{' '}
                {formatPercent(reference.rate)} par an. Hors fiscalité du placement.
              </li>
            )}
            <li>
              Gain total et TRI : apport, loyer évité pendant que tu y habitais, échéances du prêt,
              dépenses, loyers, puis la somme nette de la vente (sans l’exonération pour remploi),
              moins les frais de l’année de la vente.
            </li>
            <li>
              Rendement de l’attente : gain en plus par rapport au scénario précédent, rapporté à la
              somme nette de ce scénario, par année d’attente.
            </li>
            <li>
              Remploi : première vente d’un logement autre que ta résidence principale, sans avoir
              été propriétaire de ta résidence principale dans les 4 ans avant la vente, prix
              réinvesti dans ta résidence principale sous 24 mois. Seule la condition des 4 ans est
              vérifiée, à partir de la fin d’occupation de ce bien (
              <a href={propertyHref('informations')}>Mon bien</a>).
            </li>
            {surtax && (
              <li className="error-text">
                Plus-value imposable supérieure à 50 000 € : une surtaxe s’ajoute, elle n’est pas
                calculée ici.
              </li>
            )}
          </ul>
        </>
      )}

      <SaleAssumptionsForm assumptions={assumptions} property={property} />

      <SaleDisclaimer />
    </div>
  );
}

function RowLabel({ row, details }: { row: Row; details: ReturnType<typeof useOpenDetails> }) {
  if (!row.details) return <>{row.label}</>;
  const { id } = row.details;
  return (
    <DisclosureButton
      label={row.label}
      open={details.isOpen(id)}
      onToggle={() => details.toggle(id)}
    />
  );
}

interface ScenarioFormProps {
  property: Property;
  initial: SaleScenario | null;
  onCancel: () => void;
  onSave: (scenario: SaleScenario) => Promise<void>;
}

function ScenarioForm({ property, initial, onCancel, onSave }: ScenarioFormProps) {
  const [date, setDate] = useState(initial?.date ?? '');
  const [price, setPrice] = useState(
    initial
      ? centsToInput(initial.price)
      : property.estimatedValue > 0
        ? centsToInput(property.estimatedValue)
        : '',
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cents = parseEurosInput(price);
    const problems: string[] = [];
    if (!isPlausibleDate(date)) problems.push('Indique la date de vente.');
    else if (date <= property.acquisitionDate)
      problems.push(
        `La date de vente doit suivre la date d’acquisition (${formatDate(property.acquisitionDate)}).`,
      );
    if (cents === null || cents <= 0)
      problems.push('Le prix de vente doit être un montant positif.');
    setErrors(problems);
    if (problems.length > 0 || cents === null) return;
    setSaving(true);
    try {
      await onSave({ date, price: cents });
    } catch (e) {
      setErrors([`Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}`]);
      setSaving(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit} noValidate aria-label="Scénario de vente">
      <h2>{initial ? 'Modifier le scénario' : 'Nouveau scénario de vente'}</h2>
      <div className="row">
        <label className="field">
          <span>Date de vente *</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Prix de vente net vendeur (€) *</span>
          <input
            className="amount"
            inputMode="decimal"
            placeholder="0,00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
      </div>
      {errors.length > 0 && (
        <ul className="error-text" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" className="button primary" disabled={saving}>
          {initial ? 'Enregistrer' : 'Ajouter le scénario'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
