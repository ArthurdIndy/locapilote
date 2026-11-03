import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { db } from '../../db/database';
import { effectiveDataAsOf } from '../../db/defaultAssumptions';
import { addMonths } from '../../engine/dates';
import type { Resolved } from '../../engine/sale-defaults';
import {
  isSaleSimulation,
  simulateSale,
  waitingGainBetween,
  type SaleSimulation,
} from '../../engine/sale-simulation';
import type {
  Dataset,
  Property,
  PropertyAssumptions,
  ProjectionAssumptions,
  SaleScenario,
} from '../../engine/types';
import { DisclosureButton } from '../components/DisclosureButton';
import {
  centsToInput,
  formatDate,
  formatEuros,
  formatPercent,
  isPlausibleDate,
  parseEurosInput,
  parsePercentInput,
  rateToInput,
} from '../format';
import { useOpenDetails } from '../openDetails';
import { propertyHref } from '../router';
import { assumptionsOf } from '../saleSummary';
import { SaleDisclaimer } from './SaleDisclaimer';
import { SaleSettings } from './SaleSettings';

interface Props {
  data: Dataset;
  property: Property;
  today: string;
}

const euros = (cents: number) => formatEuros(Math.round(cents));
const minus = (cents: number) => euros(cents === 0 ? 0 : -cents);

/** Un scénario calculé, avec sa place dans la liste enregistrée. */
interface Row {
  index: number;
  sim: SaleSimulation;
  /**
   * Gain de l'attente par rapport au scénario précédent (par date) ; `null` pour le premier et
   * pour un scénario à la même date que le précédent.
   */
  waiting: number | null;
  /** Même date que le scénario précédent : pas d'attente. */
  sameDate: boolean;
}

/** Aide affichée à la place du gain de l'attente pour une ligne à la même date que la précédente. */
const SAME_DATE_HELP = 'même date que la ligne précédente : pas d’attente';

/** « attendre jusqu'au 30/06/2028 te rapporte 5 276,52 € de plus » (ou « te coûte »). */
function waitingText(row: Row): string {
  if (row.waiting === null) return '—';
  const date = formatDate(row.sim.scenario.date);
  const amount = euros(Math.abs(row.waiting));
  return row.waiting >= 0
    ? `attendre jusqu’au ${date} te rapporte ${amount} de plus`
    : `attendre jusqu’au ${date} te coûte ${amount}`;
}

/** Cash-flow d'ici la vente : « 2 515,02 € à remettre d'ici la vente (314,38 €/mois) ». */
function cashFlowText(sim: SaleSimulation): string {
  const { cashFlowUntilSale: total, monthsUntilSale: months } = sim.balance;
  const perMonth = months > 0 ? ` (${euros(Math.abs(total) / months)}/mois)` : '';
  return total <= 0
    ? `${euros(-total)} à remettre d’ici la vente${perMonth}`
    : `${euros(total)} reçus d’ici la vente${perMonth}`;
}

type Editing = { mode: 'new' } | { mode: 'edit'; index: number } | null;

/**
 * Simulations › Vente (US11) : combien je touche, combien d'impôt, ai-je intérêt à attendre.
 * Un scénario à l'ouverture ; d'autres dates se comparent dans un tableau compact.
 */
export function SalePage({ data, property, today }: Props) {
  const details = useOpenDetails('locapilote.vente.detailsOuverts');
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const assumptions = assumptionsOf(data, property);
  const asOf = effectiveDataAsOf(data.assumptions, property.id, today);
  const scenarios = assumptions.saleScenarios;

  // Aucun scénario : on en crée un par défaut (vente dans 12 mois, à la valeur estimée).
  const creating = useRef(false);
  const needsDefault = scenarios.length === 0 && property.estimatedValue > 0;
  useEffect(() => {
    if (!needsDefault || creating.current) return;
    creating.current = true;
    void db
      .saveAssumptions({
        ...assumptions,
        saleScenarios: [{ date: addMonths(today, 12), price: property.estimatedValue }],
      })
      .finally(() => {
        creating.current = false;
      });
  }, [needsDefault, assumptions, today, property.estimatedValue]);

  const saveAssumptions = (next: PropertyAssumptions) => db.saveAssumptions(next);
  const saveScenarios = (next: SaleScenario[]) =>
    saveAssumptions({ ...assumptions, saleScenarios: next });
  const saveProjection = (patch: Partial<ProjectionAssumptions>) =>
    saveAssumptions({ ...assumptions, projection: { ...assumptions.projection, ...patch } });

  const valid = scenarios
    .map((scenario, index) => ({
      index,
      result: simulateSale(data, property, assumptions, asOf.date, scenario),
    }))
    .filter((r) => isSaleSimulation(r.result))
    .map((r) => ({ index: r.index, sim: r.result as SaleSimulation }))
    // Par date, puis par prix croissant pour une même date.
    .sort(
      (a, b) =>
        a.sim.scenario.date.localeCompare(b.sim.scenario.date) ||
        a.sim.scenario.price - b.sim.scenario.price ||
        a.index - b.index,
    );
  const rows: Row[] = valid.map((v, i) => ({
    ...v,
    waiting: i === 0 ? null : waitingGainBetween(valid[i - 1]!.sim, v.sim),
    sameDate: i > 0 && valid[i - 1]!.sim.scenario.date === v.sim.scenario.date,
  }));
  const current = rows.find((r) => r.index === selected) ?? rows[0] ?? null;
  const invalid = scenarios
    .map((scenario, index) => ({ scenario, index }))
    .filter(({ index }) => !valid.some((v) => v.index === index));

  const remove = async (index: number) => {
    const s = scenarios[index]!;
    const ok = window.confirm(
      `Supprimer le scénario de vente du ${formatDate(s.date)} (${formatEuros(s.price)}) ?`,
    );
    if (!ok) return;
    await saveScenarios(scenarios.filter((_, i) => i !== index));
    setEditing(null);
    setSelected(null);
    setMessage(`Scénario du ${formatDate(s.date)} supprimé.`);
  };

  const startEdit = (next: Editing) => {
    setMessage(null);
    setEditing(next);
  };

  const scenarioName = (r: Row) => `du ${formatDate(r.sim.scenario.date)}`;

  return (
    <div className="stack">
      <div className="toolbar">
        <h3>Vente</h3>
        {!editing && current && (
          <button
            type="button"
            className="button primary"
            onClick={() => startEdit({ mode: 'new' })}
          >
            Comparer avec une autre date
          </button>
        )}
      </div>

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
            setSelected(editing.mode === 'edit' ? editing.index : next.length - 1);
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
          bien : il est compté à 0 dans la somme nette.
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

      {!current ? (
        property.estimatedValue > 0 ? (
          <p className="card muted">Préparation de la simulation…</p>
        ) : (
          <p className="card">
            Indique la valeur estimée du bien dans{' '}
            <a href={propertyHref('informations')}>Mon bien</a> : la simulation part d’une vente
            dans 12 mois à ce prix, que tu pourras modifier.
          </p>
        )
      ) : (
        <>
          {rows.length >= 2 && (
            <>
              {/* Grand écran : un tableau compact, une ligne par scénario. */}
              <div className="synthesis-wide">
                <table
                  className="synthesis-table compare-table"
                  aria-label="Comparaison des dates de vente"
                >
                  <thead>
                    <tr>
                      <th scope="col">Date de vente</th>
                      <th scope="col">Prix</th>
                      <th scope="col">Somme nette</th>
                      <th scope="col">Impôt</th>
                      <th scope="col">À remettre d’ici la vente</th>
                      <th scope="col">Gain de l’attente (par rapport à la ligne précédente)</th>
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.index} className={r === current ? 'selected' : undefined}>
                        <th scope="row">
                          <button
                            type="button"
                            className="button link"
                            aria-pressed={r === current}
                            aria-label={`Afficher le scénario ${scenarioName(r)}`}
                            onClick={() => setSelected(r.index)}
                          >
                            {formatDate(r.sim.scenario.date)}
                          </button>
                        </th>
                        <td>{euros(r.sim.scenario.price)}</td>
                        <td>{euros(r.sim.netProceeds)}</td>
                        <td>{r.sim.capitalGain ? euros(r.sim.tax) : 'non calculé'}</td>
                        <td>{euros(Math.max(0, -r.sim.balance.cashFlowUntilSale))}</td>
                        <td
                          className={
                            r.waiting === null
                              ? 'waiting'
                              : r.waiting >= 0
                                ? 'waiting positive'
                                : 'waiting negative'
                          }
                        >
                          {waitingText(r)}
                          {r.sameDate && (
                            <span className="muted small block">{SAME_DATE_HELP}</span>
                          )}
                        </td>
                        <td>
                          <span className="scenario-actions">
                            <button
                              type="button"
                              className="button small"
                              aria-label={`Modifier le scénario ${scenarioName(r)}`}
                              onClick={() => startEdit({ mode: 'edit', index: r.index })}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="button small danger"
                              aria-label={`Supprimer le scénario ${scenarioName(r)}`}
                              onClick={() => remove(r.index)}
                            >
                              Supprimer
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Téléphone : une liste de lignes courtes ; un appui affiche le scénario. */}
              <ul
                className="synthesis-narrow scenario-list"
                aria-label="Comparaison des dates de vente"
              >
                {rows.map((r) => (
                  <li key={r.index}>
                    <button
                      type="button"
                      className={r === current ? 'scenario-line selected' : 'scenario-line'}
                      aria-pressed={r === current}
                      aria-label={`Afficher le scénario ${scenarioName(r)}`}
                      onClick={() => setSelected(r.index)}
                    >
                      <span className="scenario-line-head">
                        <strong>{formatDate(r.sim.scenario.date)}</strong>
                        <span>{euros(r.sim.netProceeds)}</span>
                      </span>
                      {r.waiting !== null && (
                        <span className={r.waiting >= 0 ? 'small positive' : 'small negative'}>
                          {waitingText(r)}
                        </span>
                      )}
                      {r.sameDate && <span className="small muted">— {SAME_DATE_HELP}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <ScenarioCard
            row={current}
            canDelete={rows.length >= 2}
            details={details}
            property={property}
            onEdit={() => startEdit({ mode: 'edit', index: current.index })}
            onDelete={() => remove(current.index)}
            onSaveProjection={saveProjection}
          />
        </>
      )}

      <SaleSettings assumptions={assumptions} />

      <SaleDisclaimer />
    </div>
  );
}

interface CardProps {
  row: Row;
  canDelete: boolean;
  details: ReturnType<typeof useOpenDetails>;
  property: Property;
  onEdit: () => void;
  onDelete: () => void;
  onSaveProjection: (patch: Partial<ProjectionAssumptions>) => Promise<void>;
}

/** Carte du scénario affiché : somme nette et impôt en avant, puis remploi et cash-flow. */
function ScenarioCard({
  row,
  canDelete,
  details,
  property,
  onEdit,
  onDelete,
  onSaveProjection,
}: CardProps) {
  const { sim } = row;
  const gain = sim.capitalGain;
  const r = sim.resolved;
  const name = `du ${formatDate(sim.scenario.date)}`;
  const toggle = (id: string, label: string) => (
    <DisclosureButton label={label} open={details.isOpen(id)} onToggle={() => details.toggle(id)} />
  );

  return (
    <section className="card stack sale-card" aria-label="Scénario affiché">
      <div className="toolbar">
        <h3>
          Si tu vends le {formatDate(sim.scenario.date)} à {euros(sim.scenario.price)}
        </h3>
        <span className="scenario-actions">
          <button
            type="button"
            className="button small"
            aria-label={`Modifier le scénario ${name}`}
            onClick={onEdit}
          >
            Modifier
          </button>
          {canDelete && (
            <button
              type="button"
              className="button small danger"
              aria-label={`Supprimer le scénario ${name}`}
              onClick={onDelete}
            >
              Supprimer
            </button>
          )}
        </span>
      </div>

      <div className="sale-highlights">
        <div className="highlight">
          <span className="highlight-label">Somme nette perçue</span>
          <span className="highlight-value" data-testid="somme-nette">
            {euros(sim.netProceeds)}
          </span>
        </div>
        <div className="highlight">
          <span className="highlight-label">Impôt sur la plus-value</span>
          <span className="highlight-value" data-testid="impot">
            {gain ? euros(sim.tax) : 'non calculé'}
          </span>
          {gain?.surtaxApplies && (
            <span className="small error-text">
              Plus-value imposable supérieure à 50 000 € : surtaxe en plus, non calculée.
            </span>
          )}
        </div>
      </div>

      <ReinvestmentLine sim={sim} onSaveProjection={onSaveProjection} />

      <div className="sale-line" data-testid="cash-flow">
        <span>{cashFlowText(sim)}</span>
        {toggle('projection', 'Calcul')}
      </div>
      {details.isOpen('projection') && (
        <div className="sale-detail stack">
          <p className="muted small">
            Échéances du prêt et projection des loyers et des dépenses, des mois suivant la date des
            données ({formatDate(r.journalWindow?.to ?? sim.scenario.date)}) jusqu’à la vente, plus
            les frais de l’année de la vente. Valeurs calculées à partir du journal ; tu peux les
            modifier (vide = calcul automatique).
          </p>
          <div className="assumptions-grid">
            <OverrideField
              label="Loyer net projeté (€ / mois)"
              kind="euros"
              resolved={r.netRentMonthly}
              help={
                r.journalWindow
                  ? `Recettes du ${formatDate(r.journalWindow.from)} au ${formatDate(r.journalWindow.to)} / 12.`
                  : 'Bien pas encore loué.'
              }
              onSave={(v) => onSaveProjection({ netRentMonthly: v })}
            />
            <OverrideField
              label="Dépenses projetées (€ / an, hors prêt)"
              kind="euros"
              resolved={r.annualExpensesExcludingLoan}
              help="Dépenses payées sur la même période. Exclues : dépenses immobilisées (« À amortir ») et catégories de travaux, y compris travaux de copropriété."
              onSave={(v) => onSaveProjection({ annualExpensesExcludingLoan: v })}
            />
            <OverrideField
              label="Évolution annuelle des loyers et des charges (%)"
              kind="percent"
              resolved={r.annualGrowth}
              onSave={(v) => onSaveProjection({ annualGrowth: v })}
            />
            <OverrideField
              label="Frais de l’année de la vente (€)"
              kind="euros"
              resolved={r.saleYearCosts}
              help={`Honoraires du comptable de ${r.lastCompleteYear}.`}
              onSave={(v) => onSaveProjection({ saleYearCosts: v })}
            />
          </div>
        </div>
      )}

      <div className="sale-line">{toggle('somme-percue', 'Somme perçue')}</div>
      {details.isOpen('somme-percue') && (
        <dl className="year-lines sale-detail">
          <Line label="Prix de vente" value={euros(sim.proceeds.price)} />
          <Line label="− Frais d’agence" value={minus(sim.proceeds.agencyFees)} />
          <Line label="− Frais divers de vente" value={minus(sim.proceeds.otherSaleCosts)} />
          <Line label="− Capital restant dû" value={minus(sim.proceeds.outstandingPrincipal)} />
          <Line
            label="− Indemnités de remboursement anticipé"
            value={minus(sim.proceeds.earlyRepaymentPenalty)}
          />
          <Line label="− Impôt sur la plus-value" value={gain ? minus(sim.tax) : 'non calculé'} />
          <Line label="Somme nette perçue" value={euros(sim.netProceeds)} strong />
        </dl>
      )}

      {gain && (
        <>
          <div className="sale-line">{toggle('plus-value', 'Calcul de la plus-value')}</div>
          {details.isOpen('plus-value') && (
            <div className="sale-detail stack">
              <dl className="year-lines">
                <Line label="Durée de détention" value={`${gain.holdingYears} ans`} />
                <Line
                  label="Prix de cession (prix − frais de vente)"
                  value={euros(gain.netSalePrice)}
                />
                <Line
                  label="Prix d’achat du logement (hors mobilier)"
                  value={euros(gain.purchasePrice)}
                />
                <Line
                  label="+ Frais d’acquisition (réels ou forfait 7,5 %)"
                  value={`${euros(gain.acquisitionCosts)}${gain.acquisitionCostsIsFlat ? ' (forfait)' : ''}`}
                />
                <Line
                  label="+ Forfait travaux 15 % (plus de 5 ans)"
                  value={euros(gain.worksAllowance)}
                />
                <Line
                  label="− Amortissements déduits à réintégrer"
                  value={minus(gain.depreciationDeducted)}
                />
                <div className="detail detail-note">
                  <dt>
                    Inclut les amortissements de tous les composants (mobilier, équipements,
                    travaux) ; selon la notice 2048-IMM, seuls ceux du logement sont à réintégrer :
                    à confirmer avec le notaire.
                  </dt>
                </div>
                <Line label="Prix d’acquisition corrigé" value={euros(gain.adjustedCost)} />
                <Line label="Plus-value brute" value={euros(gain.grossGain)} />
                <Line
                  label="Abattement pour durée de détention (impôt sur le revenu)"
                  value={formatPercent(gain.incomeTaxAllowance)}
                />
                <Line
                  label="Abattement pour durée de détention (prélèvements sociaux)"
                  value={formatPercent(gain.socialChargesAllowance)}
                />
                <Line label="Impôt sur le revenu (19 %)" value={euros(gain.incomeTax)} />
                <Line label="Prélèvements sociaux (17,2 %)" value={euros(gain.socialCharges)} />
                <Line label="Impôt sur la plus-value" value={euros(sim.tax)} strong />
              </dl>
              <p className="muted small">
                Frais d’acquisition réels :{' '}
                {property.actualAcquisitionCosts
                  ? euros(property.actualAcquisitionCosts)
                  : 'non renseignés (forfait de 7,5 %)'}
                , dans <a href={propertyHref('informations')}>Mon bien</a>. Amortissements des
                années passées : stock du comptable s’il est saisi, sinon calcul de la page
                Fiscalité.
              </p>
              {gain.depreciationYears.some((y) => y.origin === 'assumption') && (
                <div className="assumptions-grid">
                  <OverrideField
                    label="Amortissements déduits par an, années futures (€)"
                    kind="euros"
                    resolved={r.depreciationDeductedPerYear}
                    help={`Par défaut, ceux de ${r.lastCompleteYear}.`}
                    onSave={(v) => onSaveProjection({ depreciationDeductedPerYear: v })}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'strong' : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const shareFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 2,
});

/**
 * Ligne du remploi. Condition des 4 ans remplie : « Exonération partielle si tu réinvestis X €
 * dans ta résidence principale sous 24 mois (Y % du prix) : impôt évité Z €, tu perçois W € »
 * (« Exonéré » si la part vaut 100 %). Part du prix réinvestie modifiable ; par défaut, ce qui
 * reste du prix de cession après remboursement du prêt.
 */
function ReinvestmentLine({
  sim,
  onSaveProjection,
}: {
  sim: SaleSimulation;
  onSaveProjection: (patch: Partial<ProjectionAssumptions>) => Promise<void>;
}) {
  const r = sim.reinvestment;
  if (r.condition === 'not-applicable') return null;
  if (r.condition === 'not-met') {
    return (
      <p className="sale-line" data-testid="remploi">
        Exonération possible à partir du {formatDate(r.eligibleFrom!)}
      </p>
    );
  }
  const share = sim.resolved.reinvestedShare.value;
  return (
    <div className="sale-line reinvestment stack">
      <span data-testid="remploi">
        {share >= 1 ? 'Exonéré' : 'Exonération partielle'} si tu réinvestis{' '}
        {euros(sim.reinvestedAmount)} dans ta résidence principale sous 24 mois (
        {shareFormat.format(share)} du prix) : impôt évité {euros(r.avoidedTax)}, tu perçois{' '}
        {euros(sim.netWithReinvestment)}
      </span>
      <OverrideField
        label="Part du prix réinvestie (%)"
        kind="percent"
        max={1}
        resolved={sim.resolved.reinvestedShare}
        help="Part du prix de vente réinvestie. L’argent qui rembourse le prêt ne compte pas."
        onSave={(v) => onSaveProjection({ mainResidenceReinvestedShare: v })}
      />
    </div>
  );
}

type Kind = 'euros' | 'percent';

const toInput = (kind: Kind, value: number) =>
  kind === 'euros' ? centsToInput(Math.round(value)) : rateToInput(value);
const parse = (kind: Kind, text: string) =>
  kind === 'euros' ? parseEurosInput(text) : parsePercentInput(text);
const show = (kind: Kind, value: number) =>
  kind === 'euros' ? euros(value) : formatPercent(value);

/**
 * Valeur calculée automatiquement, modifiable : vide = calcul automatique. Enregistrée en
 * quittant le champ (ou avec Entrée).
 */
function OverrideField({
  label,
  kind,
  resolved,
  help,
  max,
  onSave,
}: {
  label: string;
  kind: Kind;
  resolved: Resolved;
  help?: string;
  /** Valeur maximale acceptée (1 pour une part en %). */
  max?: number;
  onSave: (value: number | null) => Promise<void>;
}) {
  const id = useId();
  const initial = resolved.modified ? toInput(kind, resolved.value) : '';
  const [draft, setDraft] = useState(initial);
  const [source, setSource] = useState(resolved);
  const [error, setError] = useState<string | null>(null);
  if (source.value !== resolved.value || source.modified !== resolved.modified) {
    setSource(resolved);
    setDraft(initial);
  }
  const commit = () => {
    const text = draft.trim();
    if (text === '') {
      setError(null);
      if (resolved.modified) void onSave(null);
      return;
    }
    const parsed = parse(kind, text);
    if (parsed === null || parsed < 0 || (max !== undefined && parsed > max)) {
      setError(kind === 'euros' ? 'Montant invalide.' : 'Pourcentage invalide.');
      return;
    }
    setError(null);
    if (!resolved.modified || parsed !== resolved.value) void onSave(parsed);
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="amount"
        inputMode="decimal"
        value={draft}
        placeholder={toInput(kind, resolved.automatic)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      <span className="muted small">
        {resolved.modified
          ? `Valeur modifiée (calcul automatique : ${show(kind, resolved.automatic)}).`
          : `Calcul automatique : ${show(kind, resolved.automatic)}.`}
        {help ? ` ${help}` : ''}
      </span>
      {resolved.modified && (
        <button
          type="button"
          className="button link small"
          aria-label={`${label} : revenir au calcul automatique`}
          onClick={() => {
            setDraft('');
            setError(null);
            void onSave(null);
          }}
        >
          Revenir au calcul automatique
        </button>
      )}
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </div>
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
      <h2>{initial ? 'Modifier le scénario' : 'Comparer avec une autre date'}</h2>
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
