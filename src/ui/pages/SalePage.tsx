import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
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
  IsoDate,
  Property,
  ProjectionAssumptions,
  PropertyAssumptions,
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

const euroRounded = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const shareFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Montant du tableau : arrondi à l'euro. */
const eur0 = (cents: number) => euroRounded.format(Math.round(cents) / 100);
/** Montant d'un détail ⊕ : au centime. */
const eur = (cents: number) => formatEuros(Math.round(cents));
const minus = (cents: number) => eur(cents === 0 ? 0 : -cents);

/** Une colonne : un scénario calculé, avec sa place dans la liste enregistrée. */
interface Col {
  index: number;
  sim: SaleSimulation;
  /** Gain de l'attente depuis la colonne précédente ; `null` pour la première ou une même date. */
  waiting: number | null;
  /** Date de la colonne précédente (libellé sur téléphone). */
  previousDate: IsoDate | null;
}

interface DetailRow {
  label: string;
  value: (c: Col) => ReactNode;
}

interface Line {
  id: string;
  label: string;
  /** Libellé dans la carte du téléphone, s'il diffère. */
  phoneLabel?: (c: Col) => string;
  value: (c: Col) => ReactNode;
  strong?: boolean;
  /** Aide au survol du libellé. */
  title?: string;
  className?: (c: Col) => string | undefined;
  /** Détail replié ⊕ : lignes par colonne, puis un bloc commun à toutes les colonnes. */
  details?: { rows: DetailRow[]; extra?: ReactNode };
}

const WAITING_HELP =
  'Somme nette en plus, moins ce que tu remets en plus entre les deux dates, à prix de vente égal.';

type Editing = { mode: 'new' } | { mode: 'edit'; index: number } | null;

/**
 * Simulations › Vente (US11) : combien je touche, combien d'impôt, ai-je intérêt à attendre.
 * Même modèle que la Synthèse : une colonne par scénario (une carte sur téléphone), une ligne
 * par chiffre, les détails repliés derrière ⊕.
 */
export function SalePage({ data, property, today }: Props) {
  const details = useOpenDetails('locapilote.vente.detailsOuverts');
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  const save = (next: PropertyAssumptions) => db.saveAssumptions(next);
  const saveScenarios = (next: SaleScenario[]) => save({ ...assumptions, saleScenarios: next });
  const saveProjection = (patch: Partial<ProjectionAssumptions>) =>
    save({ ...assumptions, projection: { ...assumptions.projection, ...patch } });

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
  const cols: Col[] = valid.map((v, i) => ({
    ...v,
    waiting: i === 0 ? null : waitingGainBetween(valid[i - 1]!.sim, v.sim),
    previousDate: i === 0 ? null : valid[i - 1]!.sim.scenario.date,
  }));
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
    setMessage(`Scénario du ${formatDate(s.date)} supprimé.`);
  };

  const startEdit = (next: Editing) => {
    setMessage(null);
    setEditing(next);
  };

  const lines = cols.length > 0 ? buildLines(cols, property, saveProjection) : [];
  const menu = (c: Col) => (
    <ColumnMenu
      name={`du ${formatDate(c.sim.scenario.date)}`}
      canDelete={cols.length >= 2}
      onEdit={() => startEdit({ mode: 'edit', index: c.index })}
      onDelete={() => remove(c.index)}
    />
  );
  const addButton = (
    <button
      type="button"
      className="button small"
      disabled={editing !== null}
      onClick={() => startEdit({ mode: 'new' })}
    >
      + Autre date
    </button>
  );

  return (
    <div className="stack">
      <h3>Vente</h3>

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

      {cols.length === 0 ? (
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
          {/* Grand écran : un tableau, une colonne par scénario (comme la Synthèse). */}
          <div className="synthesis-wide">
            <table className="synthesis-table sale-table" aria-label="Simulation de vente">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Indicateur</span>
                  </th>
                  {cols.map((c) => (
                    <th key={c.index} scope="col">
                      <span className="column-head">
                        {formatDate(c.sim.scenario.date)}
                        {menu(c)}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="add-column">
                    {addButton}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <Fragment key={line.id}>
                    <tr className={line.strong ? 'strong' : undefined}>
                      <th scope="row" title={line.title}>
                        <LineLabel line={line} details={details} />
                      </th>
                      {cols.map((c) => (
                        <td key={c.index} className={line.className?.(c)}>
                          {line.value(c)}
                        </td>
                      ))}
                      <td />
                    </tr>
                    {line.details && details.isOpen(line.id) && (
                      <>
                        {line.details.rows.map((row) => (
                          <tr key={row.label} className="detail">
                            <th scope="row">{row.label}</th>
                            {cols.map((c) => (
                              <td key={c.index}>{row.value(c)}</td>
                            ))}
                            <td />
                          </tr>
                        ))}
                        {line.details.extra && (
                          <tr className="detail detail-extra">
                            <td colSpan={cols.length + 2}>{line.details.extra}</td>
                          </tr>
                        )}
                      </>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Téléphone : une carte par scénario, mêmes lignes, même ordre. */}
          <div className="synthesis-narrow stack">
            {cols.map((c) => (
              <section
                key={c.index}
                className="card year-card"
                aria-label={`Scénario du ${formatDate(c.sim.scenario.date)}`}
              >
                <div className="card-head">
                  <h3>Vente le {formatDate(c.sim.scenario.date)}</h3>
                  {menu(c)}
                </div>
                {lines.map((line) => (
                  <Fragment key={line.id}>
                    <dl className="year-lines">
                      <div className={line.strong ? 'strong' : undefined}>
                        <dt title={line.title}>
                          <LineLabel line={line} details={details} label={line.phoneLabel?.(c)} />
                        </dt>
                        <dd className={line.className?.(c)}>{line.value(c)}</dd>
                      </div>
                      {line.details &&
                        details.isOpen(line.id) &&
                        line.details.rows.map((row) => (
                          <div key={row.label} className="detail">
                            <dt>{row.label}</dt>
                            <dd>{row.value(c)}</dd>
                          </div>
                        ))}
                    </dl>
                    {line.details?.extra && details.isOpen(line.id) && (
                      <div className="detail-extra">{line.details.extra}</div>
                    )}
                  </Fragment>
                ))}
              </section>
            ))}
            <div>{addButton}</div>
          </div>
        </>
      )}

      <SaleSettings assumptions={assumptions} />

      <SaleDisclaimer />
    </div>
  );
}

/** Les lignes du tableau, dans l'ordre de l'écran. */
function buildLines(
  cols: Col[],
  property: Property,
  saveProjection: (patch: Partial<ProjectionAssumptions>) => Promise<void>,
): Line[] {
  const first = cols[0]!.sim;
  const r = first.resolved;
  const hasTaxModule = cols.some((c) => c.sim.capitalGain !== null);
  const showReinvestment = cols.some((c) => c.sim.reinvestment.condition !== 'not-applicable');
  const futureDepreciation = cols.some((c) =>
    c.sim.capitalGain?.depreciationYears.some((y) => y.origin === 'assumption'),
  );
  const gain = (c: Col) => c.sim.capitalGain!;

  const lines: Line[] = [
    { id: 'prix', label: 'Prix', value: (c) => eur0(c.sim.scenario.price) },
    {
      id: 'somme',
      label: 'Somme nette perçue',
      strong: true,
      value: (c) => eur0(c.sim.netProceeds),
      details: {
        rows: [
          { label: 'Prix de vente', value: (c) => eur(c.sim.proceeds.price) },
          { label: '− Frais d’agence', value: (c) => minus(c.sim.proceeds.agencyFees) },
          { label: '− Frais divers de vente', value: (c) => minus(c.sim.proceeds.otherSaleCosts) },
          {
            label: '− Capital restant dû',
            value: (c) => minus(c.sim.proceeds.outstandingPrincipal),
          },
          {
            label: '− Indemnités de remboursement anticipé',
            value: (c) => minus(c.sim.proceeds.earlyRepaymentPenalty),
          },
          {
            label: '− Impôt sur la plus-value',
            value: (c) => (c.sim.capitalGain ? minus(c.sim.tax) : 'non calculé'),
          },
        ],
      },
    },
    {
      id: 'impot',
      label: 'Impôt sur la plus-value',
      value: (c) =>
        c.sim.capitalGain
          ? `${eur0(c.sim.tax)}${c.sim.capitalGain.surtaxApplies ? ' + surtaxe' : ''}`
          : 'non calculé',
      ...(hasTaxModule
        ? {
            details: {
              rows: [
                { label: 'Durée de détention', value: (c) => `${gain(c).holdingYears} ans` },
                {
                  label: 'Prix de cession (prix − frais de vente)',
                  value: (c) => eur(gain(c).netSalePrice),
                },
                {
                  label: 'Prix d’achat du logement (hors mobilier)',
                  value: (c) => eur(gain(c).purchasePrice),
                },
                {
                  label: '+ Frais d’acquisition (réels ou forfait 7,5 %)',
                  value: (c) =>
                    `${eur(gain(c).acquisitionCosts)}${gain(c).acquisitionCostsIsFlat ? ' (forfait)' : ''}`,
                },
                {
                  label: '+ Forfait travaux 15 % (plus de 5 ans)',
                  value: (c) => eur(gain(c).worksAllowance),
                },
                {
                  label: '− Amortissements déduits à réintégrer',
                  value: (c) => minus(gain(c).depreciationDeducted),
                },
                { label: 'Prix d’acquisition corrigé', value: (c) => eur(gain(c).adjustedCost) },
                { label: 'Plus-value brute', value: (c) => eur(gain(c).grossGain) },
                {
                  label: 'Abattement pour durée de détention (impôt sur le revenu)',
                  value: (c) => formatPercent(gain(c).incomeTaxAllowance),
                },
                {
                  label: 'Abattement pour durée de détention (prélèvements sociaux)',
                  value: (c) => formatPercent(gain(c).socialChargesAllowance),
                },
                { label: 'Impôt sur le revenu (19 %)', value: (c) => eur(gain(c).incomeTax) },
                {
                  label: 'Prélèvements sociaux (17,2 %)',
                  value: (c) => eur(gain(c).socialCharges),
                },
                { label: 'Impôt sur la plus-value', value: (c) => eur(c.sim.tax) },
              ],
              extra: (
                <div className="stack">
                  <p className="small muted detail-note">
                    Amortissements : inclut les amortissements de tous les composants (mobilier,
                    équipements, travaux) ; selon la notice 2048-IMM, seuls ceux du logement sont à
                    réintégrer : à confirmer avec le notaire.
                  </p>
                  <p className="small muted">
                    Frais d’acquisition réels :{' '}
                    {property.actualAcquisitionCosts
                      ? eur(property.actualAcquisitionCosts)
                      : 'non renseignés (forfait de 7,5 %)'}
                    , dans <a href={propertyHref('informations')}>Mon bien</a>. Amortissements des
                    années passées : stock du comptable s’il est saisi, sinon calcul de la page
                    Fiscalité.
                    {cols.some((c) => c.sim.capitalGain?.surtaxApplies) &&
                      ' Plus-value imposable supérieure à 50 000 € : une surtaxe s’ajoute, non calculée.'}
                  </p>
                  {futureDepreciation && (
                    <div className="assumptions-grid">
                      <OverrideField
                        label="Amortissements déduits par an, années futures (€)"
                        kind="euros"
                        resolved={r.depreciationDeductedPerYear}
                        help={`Par défaut, ceux de ${r.lastCompleteYear}.`}
                        onSave={(v) => saveProjection({ depreciationDeductedPerYear: v })}
                      />
                    </div>
                  )}
                </div>
              ),
            },
          }
        : {}),
    },
  ];

  if (showReinvestment) {
    lines.push({
      id: 'remploi',
      label: 'Avec remploi',
      value: (c) => {
        const ri = c.sim.reinvestment;
        if (ri.condition === 'met') return eur0(c.sim.netWithReinvestment);
        if (ri.condition === 'not-met') return `dès le ${formatDate(ri.eligibleFrom!)}`;
        return '—';
      },
      details: {
        rows: [
          {
            label: 'Part du prix réinvestie',
            value: (c) => (
              <ShareField
                key={`${c.index}-${c.sim.resolved.reinvestedShare.value}`}
                date={c.sim.scenario.date}
                resolved={c.sim.resolved.reinvestedShare}
                onSave={(v) => saveProjection({ mainResidenceReinvestedShare: v })}
              />
            ),
          },
          {
            label: 'Impôt évité',
            value: (c) =>
              c.sim.reinvestment.condition === 'met' ? eur(c.sim.reinvestment.avoidedTax) : '—',
          },
        ],
        extra: (
          <p className="small muted">
            Seul l’argent du prix de vente compte : la part qui rembourse le prêt et un nouveau prêt
            n’entrent pas dans le calcul. À confirmer avec le notaire.
          </p>
        ),
      },
    });
  }

  lines.push(
    {
      id: 'remettre',
      label: 'À remettre d’ici la vente',
      value: (c) => {
        const total = c.sim.balance.cashFlowUntilSale;
        return total <= 0 ? eur0(-total) : `${eur0(total)} reçus`;
      },
      details: {
        rows: [
          {
            label: 'Par mois (échéances − loyer net + dépenses)',
            value: (c) => {
              const m = c.sim.balance.monthlyCashFlowUntilSale;
              if (m === null) return '—';
              return m <= 0 ? `soit ${eur(-m)}/mois` : `soit ${eur(m)}/mois reçus`;
            },
          },
          {
            label: 'Frais de l’année de la vente',
            value: (c) => `+ ${eur(c.sim.resolved.saleYearCosts.value)}`,
          },
          {
            label: 'Capital remboursé (récupéré à la vente)',
            value: (c) => `dont ${eur(c.sim.balance.principalRepaidUntilSale)}`,
          },
        ],
        extra: (
          <div className="stack">
            <p className="small muted">
              Échéances du prêt et projection des loyers et des dépenses, des mois suivant la date
              des données ({formatDate(r.journalWindow?.to ?? first.scenario.date)}) jusqu’à la
              vente. Valeurs calculées à partir du journal ; tu peux les modifier (vide = calcul
              automatique).
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
                onSave={(v) => saveProjection({ netRentMonthly: v })}
              />
              <OverrideField
                label="Dépenses projetées (€ / an, hors prêt)"
                kind="euros"
                resolved={r.annualExpensesExcludingLoan}
                help="Dépenses payées sur la même période. Exclues : dépenses immobilisées (« À amortir ») et catégories de travaux, y compris travaux de copropriété."
                onSave={(v) => saveProjection({ annualExpensesExcludingLoan: v })}
              />
              <OverrideField
                label="Évolution annuelle des loyers et des charges (%)"
                kind="percent"
                resolved={r.annualGrowth}
                onSave={(v) => saveProjection({ annualGrowth: v })}
              />
              <OverrideField
                label="Frais de l’année de la vente (€)"
                kind="euros"
                resolved={r.saleYearCosts}
                help={`Honoraires du comptable de ${r.lastCompleteYear}.`}
                onSave={(v) => saveProjection({ saleYearCosts: v })}
              />
            </div>
          </div>
        ),
      },
    },
    {
      id: 'attendre',
      label: 'Attendre depuis la colonne précédente',
      phoneLabel: (c) =>
        c.previousDate ? `Attendre depuis le ${formatDate(c.previousDate)}` : 'Attendre',
      title: WAITING_HELP,
      value: (c) => {
        if (c.waiting === null) return '—';
        const amount = euroRounded.format(Math.abs(Math.round(c.waiting)) / 100);
        return c.waiting >= 0 ? `+ ${amount}` : `− ${amount}`;
      },
      className: (c) =>
        c.waiting === null ? 'waiting' : c.waiting >= 0 ? 'waiting positive' : 'waiting negative',
    },
  );
  return lines;
}

function LineLabel({
  line,
  details,
  label,
}: {
  line: Line;
  details: ReturnType<typeof useOpenDetails>;
  label?: string | undefined;
}) {
  const text = label ?? line.label;
  if (!line.details) return <>{text}</>;
  return (
    <DisclosureButton
      label={text}
      open={details.isOpen(line.id)}
      onToggle={() => details.toggle(line.id)}
    />
  );
}

/** Icône ✎ d'un en-tête de colonne : un menu Modifier / Supprimer. */
function ColumnMenu({
  name,
  canDelete,
  onEdit,
  onDelete,
}: {
  name: string;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span className="column-menu" ref={wrapper}>
      <button
        type="button"
        className="column-menu-button"
        aria-label={`Modifier ou supprimer le scénario ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ✎
      </button>
      {open && (
        <span className="column-menu-list" role="menu" aria-label={`Scénario ${name}`}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Modifier
          </button>
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              className="danger-text"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Supprimer
            </button>
          )}
        </span>
      )}
    </span>
  );
}

type Kind = 'euros' | 'percent';

/** Taux affiché à 0,1 % près dans un champ : 0.688114 → « 68,8 ». */
const percentToInput = (rate: number) => String(Math.round(rate * 1000) / 10).replace('.', ',');
const toInput = (kind: Kind, value: number) =>
  kind === 'euros' ? centsToInput(Math.round(value)) : percentToInput(value);
const parse = (kind: Kind, text: string) =>
  kind === 'euros' ? parseEurosInput(text) : parsePercentInput(text);
const show = (kind: Kind, value: number) =>
  kind === 'euros' ? eur(value) : shareFormat.format(value);

/**
 * Part du prix réinvestie d'une colonne : champ compact affiché à 0,1 % près, « calculé » ou
 * « modifié » (avec retour au calcul automatique). La valeur modifiée vaut pour tous les
 * scénarios du bien.
 */
function ShareField({
  date,
  resolved,
  onSave,
}: {
  date: IsoDate;
  resolved: Resolved;
  onSave: (value: number | null) => Promise<void>;
}) {
  const shown = percentToInput(resolved.value);
  const [draft, setDraft] = useState(shown);
  const [error, setError] = useState(false);
  const commit = () => {
    const text = draft.trim();
    if (text === '') {
      if (resolved.modified) void onSave(null);
      else setDraft(shown);
      return;
    }
    const parsed = parsePercentInput(text);
    if (parsed === null || parsed > 1) {
      setError(true);
      return;
    }
    setError(false);
    if (text === shown) return;
    void onSave(parsed);
  };
  return (
    <span className="share-field">
      <input
        className="amount"
        inputMode="decimal"
        aria-label={`Part du prix réinvestie (%), vente du ${formatDate(date)}`}
        aria-invalid={error || undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      <span aria-hidden="true"> %</span>
      <span className="share-status small muted">
        {resolved.modified ? 'modifié' : 'calculé'}
        {resolved.modified && (
          <>
            {' · '}
            <button
              type="button"
              className="button link small"
              aria-label={`Revenir au calcul automatique de la part réinvestie (${shareFormat.format(resolved.automatic)})`}
              onClick={() => void onSave(null)}
            >
              Revenir au calcul automatique
            </button>
          </>
        )}
      </span>
    </span>
  );
}

/**
 * Valeur calculée automatiquement, modifiable : vide = calcul automatique. Enregistrée en
 * quittant le champ (ou avec Entrée).
 */
function OverrideField({
  label,
  kind,
  resolved,
  help,
  onSave,
}: {
  label: string;
  kind: Kind;
  resolved: Resolved;
  help?: string;
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
    if (parsed === null || parsed < 0) {
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
          aria-label={`Revenir au calcul automatique : ${label}`}
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
      <h2>{initial ? 'Modifier le scénario' : 'Autre date de vente'}</h2>
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
