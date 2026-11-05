import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { db } from '../../db/database';
import { effectiveDataAsOf } from '../../db/defaultAssumptions';
import {
  budgetYears,
  isBudgetLine,
  yearBudget,
  type BudgetRow,
  type BudgetRowId,
  type YearBudget,
} from '../../engine/core/budget';
import { yearOf } from '../../engine/dates';
import { DEFAULT_ANNUAL_GROWTH, resolve } from '../../engine/sale-defaults';
import type { BudgetLine, Dataset, Property } from '../../engine/types';
import { DisclosureButton } from '../components/DisclosureButton';
import { PropertyTitle } from '../components/PropertyTitle';
import { centsToInput, formatDate, parseEurosInput } from '../format';
import { BUDGET_LINE_SLUGS, BUDGET_ROW_LABELS } from '../labels';
import { useOpenDetails } from '../openDetails';
import { propertyHref, routeHref } from '../router';
import { assumptionsOf } from '../saleSummary';
import { percentToInput } from '../valueFormat';

interface Props {
  data: Dataset;
  property: Property | null;
  today: string;
}

const euroRounded = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const euroSigned = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

/**
 * Centimes → euros entiers, arrondis au plus proche, le demi-euro en s'éloignant de zéro pour
 * les négatifs comme pour les positifs (−3 083,50 € → −3 084 €, comme 3 083,50 € → 3 084 €).
 */
const roundEuros = (cents: number) => Math.sign(cents) * Math.round(Math.abs(cents) / 100) || 0;

/** Montant du tableau, arrondi à l'euro (signe moins comme dans la Synthèse). */
const eur0 = (cents: number) => euroRounded.format(roundEuros(cents));

/** Effet arrondi à l'euro, avec son signe : « +43 € », « -1 622 € », « 0 € ». */
const signedEur0 = (cents: number) => euroSigned.format(roundEuros(cents));

/**
 * Couleur de l'effet sur le cash-flow : le signe suit déjà l'effet pour le propriétaire (loyer
 * en plus ou dépense en moins : positif). Positif en vert, négatif en rouge, 0 € en gris.
 */
function effectClass(effect: number): string {
  const euros = roundEuros(effect);
  return euros === 0 ? 'gap-zero' : euros > 0 ? 'positive' : 'negative';
}

/** Cash-flow : rouge s'il est négatif, vert s'il est positif, comme dans la Synthèse. */
function cashFlowClass(row: BudgetRow, cents: number | null): string | undefined {
  if (row.id !== 'cashFlow' || cents === null) return undefined;
  const euros = roundEuros(cents);
  return euros < 0 ? 'negative' : euros > 0 ? 'positive' : undefined;
}

const isEditable = isBudgetLine;

/** Lignes de total, en gras. */
const STRONG: ReadonlySet<BudgetRowId> = new Set(['totalExpenses', 'cashFlow']);

/** Aide au survol de certaines lignes. */
const ROW_HELP: Partial<Record<BudgetRowId, string>> = {
  other:
    'Travaux, investissements à amortir, dépenses à qualifier. Prévu à 0 par défaut : dépenses exceptionnelles.',
  loan: 'D’après l’échéancier du prêt.',
  totalExpenses: 'Dépenses + prêt.',
};

/** Budget (US12) : l'année en cours du bien courant, prévu, réalisé et écarts. */
export function BudgetPage({ data, property, today }: Props) {
  if (!property) {
    return (
      <section className="card">
        <h2>Budget</h2>
        <p>Crée d’abord un bien.</p>
        <a className="button primary" href={propertyHref('informations')}>
          Créer un bien
        </a>
      </section>
    );
  }
  return (
    <div className="stack">
      <PropertyTitle title="Budget" />
      {/* Un bien à la fois : changer de bien revient à l'année en cours. */}
      <BudgetView key={property.id} data={data} property={property} today={today} />
    </div>
  );
}

function BudgetView({
  data,
  property,
  today,
}: {
  data: Dataset;
  property: Property;
  today: string;
}) {
  const details = useOpenDetails('locapilote.budget.detailsOuverts');
  const asOf = effectiveDataAsOf(data.assumptions, property.id, today).date;
  const dataYear = yearOf(asOf);
  const years = budgetYears(property, asOf);
  const [chosen, setChosen] = useState(dataYear);
  const [editing, setEditing] = useState<BudgetLine | null>(null);

  if (years.length === 0) {
    return (
      <p className="card">
        Indique la date de mise en location du bien (
        <a href={propertyHref('informations')}>Mon bien</a>) pour voir son budget.
      </p>
    );
  }
  const year = years.includes(chosen) ? chosen : years.includes(dataYear) ? dataYear : years[0]!;
  const growth = resolve(
    assumptionsOf(data, property).projection.annualGrowth,
    DEFAULT_ANNUAL_GROWTH,
  ).value;
  const budget = yearBudget(data, property, year, asOf, growth);
  const columns = columnsOf(budget);

  const save = (line: BudgetLine, value: number | null) =>
    db.saveBudgetLine(property.id, year, line, value);

  const cellProps = { budget, editing, setEditing, save };
  const byId = (id: BudgetRowId) => budget.rows.find((r) => r.id === id)!;
  const income = byId('income');
  const totalExpenses = byId('totalExpenses');
  const cashFlow = byId('cashFlow');
  // Sorties : les lignes de dépense, puis le prêt.
  const expenses = budget.rows.filter(
    (r) => r.id !== 'income' && r.id !== 'totalExpenses' && r.id !== 'cashFlow',
  );

  const card = (row: BudgetRow) => {
    const label = BUDGET_ROW_LABELS[row.id];
    return (
      <section
        key={row.id}
        className={`card year-card budget-card${STRONG.has(row.id) ? ' strong' : ''}`}
        aria-label={label}
      >
        <div className="card-head">
          <h4>{label}</h4>
          {isEditable(row.id) && <EditButton line={row.id} {...cellProps} />}
        </div>
        <dl className="year-lines">
          {columns.map((c) => (
            <div key={c.key}>
              <dt>{c.label}</dt>
              <dd className={c.className?.(row)}>
                {c.key === 'planned' ? <PlannedCell row={row} {...cellProps} /> : c.value(row)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  };
  const dayMonth = formatDate(asOf).slice(0, 5);
  // ⊕ sur toutes les lignes modifiables, quelle que soit l'année ; « Au JJ/MM » pour l'année
  // en cours seulement.
  const showToDate = budget.kind === 'current';
  const operationsHref = (line: BudgetLine) =>
    routeHref('operations', {
      bien: property.id,
      annee: String(year),
      budget: BUDGET_LINE_SLUGS[line],
    });

  return (
    <>
      <div className="toolbar">
        <label className="budget-year">
          <span className="visually-hidden">Année du budget</span>
          <select
            value={year}
            onChange={(e) => {
              setEditing(null);
              setChosen(Number(e.target.value));
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                Budget {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Grand écran : un tableau au modèle de la Synthèse, intertitres Entrées et Sorties. */}
      <div className="synthesis-wide">
        <table className="synthesis-table budget-table" aria-label={`Budget ${year}`}>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Ligne</span>
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          {[
            { title: 'Entrées', rows: [income] },
            { title: 'Sorties', rows: [...expenses, totalExpenses] },
            { title: null, rows: [cashFlow] },
          ].map((section) => (
            <tbody key={section.title ?? 'total'}>
              {section.title && (
                <tr className="section-row">
                  <th scope="rowgroup" colSpan={columns.length + 1}>
                    {section.title}
                  </th>
                </tr>
              )}
              {section.rows.map((row) => {
                const editable = isEditable(row.id);
                const hasDetail = editable;
                const label = BUDGET_ROW_LABELS[row.id];
                return (
                  <Fragment key={row.id}>
                    <tr className={STRONG.has(row.id) ? 'strong' : undefined}>
                      <th scope="row" title={ROW_HELP[row.id]}>
                        <span className="budget-label">
                          {hasDetail ? (
                            <DisclosureButton
                              label={label}
                              open={details.isOpen(row.id)}
                              onToggle={() => details.toggle(row.id)}
                            />
                          ) : (
                            label
                          )}
                          {editable && <EditButton line={row.id as BudgetLine} {...cellProps} />}
                        </span>
                      </th>
                      {columns.map((c) => (
                        <td key={c.key} className={c.className?.(row)}>
                          {c.key === 'planned' ? (
                            <PlannedCell row={row} {...cellProps} />
                          ) : (
                            c.value(row)
                          )}
                        </td>
                      ))}
                    </tr>
                    {hasDetail && details.isOpen(row.id) && (
                      <>
                        {showToDate && (
                          <tr className="detail">
                            <th scope="row">Au {dayMonth}</th>
                            <td>{eur0(row.previousToDate ?? 0)}</td>
                            <td />
                            <td>{eur0(row.paidToDate ?? 0)}</td>
                            <td />
                          </tr>
                        )}
                        <tr className="detail">
                          <th scope="row" colSpan={columns.length + 1}>
                            <a href={operationsHref(row.id as BudgetLine)}>
                              Voir les opérations {year} ›
                            </a>
                          </th>
                        </tr>
                      </>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      {/*
       * Téléphone : « Cash-flow » et « Total des sorties » en premier, puis les entrées, puis une
       * carte par ligne de sortie.
       */}
      <div className="synthesis-narrow stack">
        {[cashFlow, totalExpenses].map(card)}
        <h3 className="section-title">Entrées</h3>
        {card(income)}
        <h3 className="section-title">Sorties</h3>
        {expenses.map(card)}
      </div>

      <p className="muted small">
        Prévu : année précédente + {percentToInput(growth)} %, sauf lignes modifiées.
        {budget.kind === 'current' && ' Estimé fin d’année : payé à ce jour + ce qui reste prévu.'}
      </p>
    </>
  );
}

interface Column {
  key: 'previous' | 'planned' | 'actual' | 'effect';
  label: string;
  value: (row: BudgetRow) => string;
  className?: (row: BudgetRow) => string | undefined;
}

/**
 * Colonnes selon l'année : en cours (N−1 réel, N prévu, N estimé fin d'année, effet sur le
 * cash-flow), terminée (N−1 réel, N prévu, N réel, effet) ou future (N−1 réel ou estimé,
 * N prévu). « (ramené à 12 mois) » quand N−1 est une première année de location incomplète.
 */
function columnsOf(budget: YearBudget): Column[] {
  const { year, kind } = budget;
  const dataYear = yearOf(budget.dataAsOf);
  const previousKind = year - 1 < dataYear ? 'réel' : year - 1 === dataYear ? 'estimé' : 'prévu';
  const previous: Column = {
    key: 'previous',
    label: `${year - 1} ${previousKind}${budget.previousProrated ? ' (ramené à 12 mois)' : ''}`,
    value: (r) => eur0(r.previous),
    className: (r) => cashFlowClass(r, r.previous),
  };
  const planned: Column = {
    key: 'planned',
    label: `${year} prévu`,
    value: (r) => eur0(r.planned),
    className: (r) => cashFlowClass(r, r.planned),
  };
  if (kind === 'future') return [previous, planned];
  return [
    previous,
    planned,
    {
      key: 'actual',
      label: kind === 'current' ? `${year} estimé fin d’année` : `${year} réel`,
      value: (r) => eur0(r.actual ?? 0),
      className: (r) => cashFlowClass(r, r.actual),
    },
    {
      key: 'effect',
      label: 'Effet sur ton cash-flow',
      value: (r) => signedEur0(r.effect ?? 0),
      className: (r) => effectClass(r.effect ?? 0),
    },
  ];
}

interface CellProps {
  budget: YearBudget;
  editing: BudgetLine | null;
  setEditing: (line: BudgetLine | null) => void;
  save: (line: BudgetLine, value: number | null) => Promise<void>;
}

/** ✎ d'une ligne : ouvre la saisie du prévu de l'année. */
function EditButton({ line, editing, setEditing }: CellProps & { line: BudgetLine }) {
  return (
    <button
      type="button"
      className="column-menu-button"
      aria-label={`Modifier le prévu : ${BUDGET_ROW_LABELS[line]}`}
      aria-pressed={editing === line}
      onClick={() => setEditing(editing === line ? null : line)}
    >
      ✎
    </button>
  );
}

/**
 * Prévu d'une ligne : le montant, « modifié » avec le retour au calcul automatique, ou le champ
 * de saisie après ✎ (Entrée ou sortie du champ pour enregistrer, Échap pour annuler).
 */
function PlannedCell({ row, budget, editing, setEditing, save }: CellProps & { row: BudgetRow }) {
  if (!isEditable(row.id)) return <>{eur0(row.planned)}</>;
  const line = row.id;
  const label = BUDGET_ROW_LABELS[line];
  if (editing === line) {
    return (
      <PlannedInput
        label={`Prévu ${budget.year} : ${label} (€)`}
        initial={centsToInput(Math.round(row.planned))}
        onCancel={() => setEditing(null)}
        onSave={async (value) => {
          await save(line, value === row.automatic ? null : value);
          setEditing(null);
        }}
      />
    );
  }
  if (!row.modified) return <>{eur0(row.planned)}</>;
  return (
    <span className="budget-planned">
      <span>{eur0(row.planned)}</span>
      <span className="small muted">
        modifié ·{' '}
        <button
          type="button"
          className="button link small"
          aria-label={`Revenir au calcul automatique : ${label} (${eur0(row.automatic)})`}
          onClick={() => void save(line, null)}
        >
          Revenir au calcul automatique
        </button>
      </span>
    </span>
  );
}

function PlannedInput({
  label,
  initial,
  onCancel,
  onSave,
}: {
  label: string;
  initial: string;
  onCancel: () => void;
  onSave: (value: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const commit = () => {
    if (done.current) return;
    const value = parseEurosInput(draft.trim());
    if (value === null || value < 0) {
      setError(true);
      return;
    }
    done.current = true;
    void onSave(value);
  };
  return (
    <span className="budget-input">
      <input
        ref={input}
        className="amount"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={error || undefined}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(false);
        }}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            done.current = true;
            onCancel();
          }
        }}
      />
      {error && (
        <span className="error-text small" role="alert">
          Montant invalide.
        </span>
      )}
    </span>
  );
}
