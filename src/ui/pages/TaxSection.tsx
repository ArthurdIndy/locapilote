import { useState, type FormEvent } from 'react';
import { db } from '../../db/database';
import {
  lmnpReelSummary,
  reconcile,
  type LmnpReelYear,
  type ReconciliationLine,
  type ReconciliationStatus,
} from '../../engine/tax/lmnp-reel';
import type {
  AccountantFiling,
  Cents,
  Dataset,
  FilingLine,
  IsoDate,
  Property,
} from '../../engine/types';
import { downloadText } from '../download';
import { centsToInput, formatDate, formatEuros, parseEurosInput } from '../format';
import { REGIME_LABELS } from '../labels';
import { routeHref } from '../router';
import { recapRows, recapToCsv, type RecapRow } from '../taxRecap';
import { TO_REVIEW_FILTER } from './TransactionsPage';
import { TaxDisclaimer } from './TaxDisclaimer';

interface Props {
  data: Dataset;
  property: Property;
  dataAsOf: IsoDate;
}

/** Bloc fiscal affiché sous la synthèse : celui du régime du bien. */
export function TaxSection({ data, property, dataAsOf }: Props) {
  if (property.taxRegime !== 'lmnp-reel') {
    return (
      <section className="card tax-placeholder" aria-label="Résultat fiscal">
        <h3>Résultat fiscal</h3>
        <p>
          Le calcul fiscal n’est pas encore disponible pour ce régime (
          {REGIME_LABELS[property.taxRegime]}). Seul le LMNP au réel est calculé pour l’instant.
        </p>
        <TaxDisclaimer />
      </section>
    );
  }
  return <LmnpReelSection data={data} property={property} dataAsOf={dataAsOf} />;
}

function rowValue(row: Exclude<RecapRow, { kind: 'section' }>, y: LmnpReelYear): string {
  const v = row.value(y);
  if (v === null) return 'non saisi';
  if (row.deficit && v < 0) return `${formatEuros(v)} (déficit)`;
  return formatEuros(v);
}

function rowClass(row: RecapRow): string {
  if (row.kind === 'section') return '';
  return [row.kind === 'detail' && 'detail', row.kind === 'total' && 'strong', row.info && 'info']
    .filter(Boolean)
    .join(' ');
}

const signClass = (row: Exclude<RecapRow, { kind: 'section' }>, y: LmnpReelYear) => {
  const v = row.value(y);
  return row.deficit && v !== null && v < 0 ? 'negative' : undefined;
};

function LmnpReelSection({ data, property, dataAsOf }: Props) {
  const years = lmnpReelSummary(data, property, dataAsOf);
  const rows = recapRows(years);
  const lastYear = years.at(-1);
  const partial = lastYear !== undefined && dataAsOf < `${lastYear.year}-12-31`;
  const toReviewYears = years.filter((y) => y.toReviewCount > 0);
  const deficitYears = years.filter((y) => y.resultBeforeDepreciation < 0);

  const exportCsv = () =>
    downloadText(
      `locapilote-recapitulatif-lmnp-${property.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`,
      recapToCsv(property, years, dataAsOf),
      'text/csv;charset=utf-8',
    );

  const print = () => {
    document.body.classList.add('print-tax');
    const done = () => {
      document.body.classList.remove('print-tax');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <section className="stack tax-section" aria-label="Résultat fiscal LMNP au réel">
      <div className="toolbar">
        <h3>Résultat fiscal · LMNP au réel</h3>
        {years.length > 0 && (
          <div className="actions no-print">
            <button type="button" className="button small" onClick={exportCsv}>
              Exporter en CSV
            </button>
            <button type="button" className="button small" onClick={print}>
              Version imprimable
            </button>
          </div>
        )}
      </div>
      <p className="print-only">
        {property.name} · données à jour au {formatDate(dataAsOf)}
      </p>
      <TaxDisclaimer />

      {years.length === 0 ? (
        <p className="card muted">Rien à calculer avant la mise en location du bien.</p>
      ) : (
        <>
          {partial && (
            <p className="muted small">
              {lastYear.year} : année en cours, estimation. La dotation est celle de l’année
              entière, alors que les recettes ne sont saisies que jusqu’au {formatDate(dataAsOf)}.
            </p>
          )}

          {toReviewYears.map((y) => (
            <p key={y.year} className="warning">
              {y.year} : {y.toReviewCount} mouvement{y.toReviewCount > 1 ? 's' : ''} « À valider » (
              {formatEuros(y.toReview)}) non retenu{y.toReviewCount > 1 ? 's' : ''} dans le résultat
              fiscal.{' '}
              <a
                className="no-print"
                href={routeHref('mouvements', {
                  bien: property.id,
                  annee: String(y.year),
                  fiscal: TO_REVIEW_FILTER,
                })}
              >
                Voir {y.toReviewCount > 1 ? 'les mouvements concernés' : 'le mouvement concerné'}
              </a>
            </p>
          ))}

          <div className="synthesis-wide">
            <table className="synthesis-table" aria-label="Récapitulatif LMNP réel">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Rubrique</span>
                  </th>
                  {years.map((y) => (
                    <th key={y.year} scope="col">
                      {y.year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.kind === 'section' ? (
                    <tr key={row.label} className="section-row">
                      <th scope="rowgroup" colSpan={years.length + 1}>
                        {row.label}
                      </th>
                    </tr>
                  ) : (
                    <tr key={row.label} className={rowClass(row)}>
                      <th scope="row">{row.label}</th>
                      {years.map((y) => (
                        <td key={y.year} className={signClass(row, y)}>
                          {rowValue(row, y)}
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          <div className="synthesis-narrow stack">
            {[...years].reverse().map((y) => (
              <section key={y.year} className="card year-card" aria-label={`Fiscalité ${y.year}`}>
                <h3>{y.year}</h3>
                {splitSections(rows).map(({ title, lines }) => (
                  <div key={title}>
                    <h4>{title}</h4>
                    <dl className="year-lines">
                      {lines.map((row) => (
                        <div key={row.label} className={rowClass(row)}>
                          <dt>{row.label}</dt>
                          <dd className={signClass(row, y)}>{rowValue(row, y)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </section>
            ))}
          </div>

          <ul className="muted small notes">
            <li>
              Un amortissement ne crée pas de déficit : la part non utilisée est reportée, sans
              limite de durée. Quand le stock reporté retenu par le comptable est saisi, c’est lui
              qui sert de point de départ l’année suivante.
            </li>
            {deficitYears.length > 0 && (
              <li>
                Déficit en {deficitYears.map((y) => y.year).join(', ')} : il est affiché mais son
                report sur les années suivantes n’est pas encore géré par Locapilote.
              </li>
            )}
            <li className="no-print">
              Les investissements de l’année sont à reporter dans les{' '}
              <a href={routeHref('immobilisations')}>immobilisations</a> pour être amortis.
            </li>
          </ul>

          <Reconciliation data={data} property={property} years={years} />
        </>
      )}
    </section>
  );
}

function splitSections(rows: RecapRow[]) {
  const sections: { title: string; lines: Exclude<RecapRow, { kind: 'section' }>[] }[] = [];
  for (const row of rows) {
    if (row.kind === 'section') sections.push({ title: row.label, lines: [] });
    else sections.at(-1)?.lines.push(row);
  }
  return sections;
}

// ---------- Rapprochement avec le comptable ----------

const LINE_LABELS: Record<ReconciliationLine['line'], string> = {
  income: 'Recettes',
  expenses: 'Charges hors amortissements',
  depreciation: 'Dotations aux amortissements',
  result: 'Résultat fiscal',
  carryforward: 'Stock d’amortissements reporté (fin d’année)',
};

const STATUS_LABELS: Record<ReconciliationStatus, string> = {
  'not-entered': 'Non saisi',
  ok: 'OK',
  explained: 'Écart expliqué',
  'to-explain': 'À expliquer',
};

const gapText = (gap: Cents | null) =>
  gap === null ? '—' : `${gap > 0 ? '+' : ''}${formatEuros(gap)}`;

function Reconciliation({
  data,
  property,
  years,
}: {
  data: Dataset;
  property: Property;
  years: LmnpReelYear[];
}) {
  // Par défaut, la dernière année dont les comptes sont déposés ; sinon l'année précédente.
  const filed = years.filter((y) =>
    data.accountantFilings.some((f) => f.propertyId === property.id && f.year === y.year),
  );
  const [selected, setSelected] = useState<number>(
    () => (filed.at(-1) ?? years.at(-2) ?? years.at(-1))!.year,
  );
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const year = years.find((y) => y.year === selected) ?? years.at(-1)!;
  const filing = data.accountantFilings.find(
    (f) => f.propertyId === property.id && f.year === year.year,
  );
  const lines = reconcile(year, filing);

  return (
    <section className="card stack reconciliation" aria-label="Rapprochement avec le comptable">
      <h3>Rapprochement avec le comptable</h3>
      <p className="muted small no-print">
        Saisis les montants des comptes déposés par ton comptable : Locapilote affiche l’écart avec
        son calcul, que tu peux expliquer en quelques mots. Le stock d’amortissements reporté qu’il
        a retenu fait foi pour l’année suivante.
      </p>
      <div className="year-tabs no-print" role="group" aria-label="Année">
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            className={`button small${y.year === year.year ? ' primary' : ''}`}
            aria-pressed={y.year === year.year}
            onClick={() => {
              setSelected(y.year);
              setEditing(false);
              setMessage(null);
            }}
          >
            {y.year}
          </button>
        ))}
      </div>

      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}

      {editing ? (
        <FilingForm
          key={year.year}
          property={property}
          year={year}
          filing={filing}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setMessage(`Comptes ${year.year} enregistrés.`);
          }}
        />
      ) : (
        <>
          <ul className="reconciliation-lines" aria-label={`Comptes ${year.year}`}>
            <li className="reconciliation-head" aria-hidden="true">
              <span>{year.year}</span>
              <span>Locapilote</span>
              <span>Comptable</span>
              <span>Écart</span>
              <span />
            </li>
            {lines.map((l) => (
              <li key={l.line} className="reconciliation-line" aria-label={LINE_LABELS[l.line]}>
                <strong className="rl-label">{LINE_LABELS[l.line]}</strong>
                <span className="rl-tool" data-label="Locapilote">
                  {formatEuros(l.tool)}
                </span>
                <span className="rl-accountant" data-label="Comptable">
                  {l.accountant === null ? '—' : formatEuros(l.accountant)}
                </span>
                <span className="rl-gap" data-label="Écart">
                  {gapText(l.gap)}
                </span>
                <span className={`rl-status badge status-${l.status}`}>
                  {STATUS_LABELS[l.status]}
                </span>
                {l.comment && <span className="rl-comment muted small">{l.comment}</span>}
              </li>
            ))}
          </ul>
          <div className="actions no-print">
            <button type="button" className="button" onClick={() => setEditing(true)}>
              {filing || year.accountantCarryforward !== null
                ? `Modifier les comptes ${year.year}`
                : `Saisir les comptes ${year.year}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const FILING_FIELDS: { line: FilingLine | 'carryforward'; label: string }[] = [
  { line: 'income', label: 'Recettes (€)' },
  { line: 'expenses', label: 'Charges hors amortissements (€)' },
  { line: 'depreciation', label: 'Dotations aux amortissements (€)' },
  { line: 'result', label: 'Résultat fiscal (€)' },
  { line: 'carryforward', label: 'Stock d’amortissements reporté (€)' },
];

function FilingForm({
  property,
  year,
  filing,
  onCancel,
  onSaved,
}: {
  property: Property;
  year: LmnpReelYear;
  filing: AccountantFiling | undefined;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const initialAmount = (line: FilingLine | 'carryforward') => {
    const cents =
      line === 'carryforward' ? year.accountantCarryforward : (filing?.amounts[line] ?? null);
    return cents === null || cents === undefined ? '' : centsToInput(cents);
  };
  const [amounts, setAmounts] = useState(() =>
    Object.fromEntries(FILING_FIELDS.map((f) => [f.line, initialAmount(f.line)])),
  );
  const [comments, setComments] = useState(() =>
    Object.fromEntries(FILING_FIELDS.map((f) => [f.line, filing?.comments[f.line] ?? ''])),
  );
  const [errors, setErrors] = useState<string[]>([]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: string[] = [];
    const parsed: Partial<Record<FilingLine | 'carryforward', Cents>> = {};
    for (const f of FILING_FIELDS) {
      const text = amounts[f.line]!.trim();
      if (!text) continue;
      const cents = parseEurosInput(text);
      if (cents === null) problems.push(`${f.label.replace(' (€)', '')} : montant invalide.`);
      else parsed[f.line] = cents;
    }
    setErrors(problems);
    if (problems.length > 0) return;
    const { carryforward = null, ...filingAmounts } = parsed;
    const filingComments = Object.fromEntries(
      Object.entries(comments)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v),
    );
    try {
      await db.saveAccountantYear(
        {
          propertyId: property.id,
          year: year.year,
          amounts: filingAmounts,
          comments: filingComments,
        },
        carryforward,
      );
      onSaved();
    } catch (e) {
      setErrors([`Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}`]);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate aria-label={`Comptes déposés ${year.year}`}>
      <h4>Comptes déposés {year.year}</h4>
      <p className="muted small">
        Laisse vide ce que tu n’as pas. Le stock d’amortissements reporté est celui que le comptable
        reporte sur l’année {year.year + 1}.
      </p>
      {FILING_FIELDS.map((f) => (
        <fieldset key={f.line} className="filing-field">
          <legend>{f.label.replace(' (€)', '')}</legend>
          <div className="row">
            <label className="field">
              <span>{f.label}</span>
              <input
                className="amount"
                inputMode="decimal"
                placeholder="non saisi"
                value={amounts[f.line]}
                onChange={(e) => setAmounts({ ...amounts, [f.line]: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Explication de l’écart</span>
              <textarea
                rows={2}
                value={comments[f.line]}
                onChange={(e) => setComments({ ...comments, [f.line]: e.target.value })}
              />
            </label>
          </div>
        </fieldset>
      ))}
      {errors.length > 0 && (
        <ul className="error-text" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" className="button primary">
          Enregistrer
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
