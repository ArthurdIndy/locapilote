import { useMemo, useState } from 'react';
import { db } from '../../db/database';
import { budgetLineOf } from '../../engine/core/budget';
import type { BudgetLine, Category, Dataset, Transaction } from '../../engine/types';
import { formatDate, formatEuros } from '../format';
import { BUDGET_LINE_SLUGS, BUDGET_ROW_LABELS, sortCategories } from '../labels';
import { propertyHref } from '../router';
import { TransactionForm } from './TransactionForm';
import { PropertyTitle } from '../components/PropertyTitle';

type Editing = { mode: 'new' } | { mode: 'edit'; transaction: Transaction } | null;

interface Props {
  data: Dataset;
  currentPropertyId: string | null;
  today: string;
  /**
   * Filtres reçus dans l'adresse : `annee`, `groupe`, `fiscal=a-valider`, `budget` (une ligne
   * du budget : `copropriete`…, voir `BUDGET_LINE_SLUGS`). Le paramètre `bien`
   * rend ce bien courant (App.tsx) : la page ne montre que les opérations du bien courant.
   */
  params?: URLSearchParams;
}

/** Valeur de `fiscal` dans l'adresse : opérations « À valider » (non retenus au résultat fiscal). */
export const TO_REVIEW_FILTER = 'a-valider';

/** Montant signé pour l'affichage : + pour une recette, − pour une dépense. */
function signedAmount(t: Transaction, category: Category | undefined): string {
  const amount = formatEuros(t.amount);
  if (category?.direction === 'income') return t.amount < 0 ? amount : `+${amount}`;
  if (category?.direction === 'expense') {
    return t.amount < 0 ? `+${formatEuros(-t.amount)}` : `−${amount}`;
  }
  return amount;
}

export function TransactionsPage({ data, currentPropertyId, today, params }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState(() => params?.get('annee') ?? '');
  const [groupFilter, setGroupFilter] = useState(() => params?.get('groupe') ?? '');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [toReviewOnly, setToReviewOnly] = useState(
    () => params?.get('fiscal') === TO_REVIEW_FILTER,
  );
  // Ligne du budget (lien « Voir les opérations » du détail d'une ligne du budget).
  const [budgetLine, setBudgetLine] = useState<BudgetLine | null>(() => {
    const slug = params?.get('budget');
    const entry = Object.entries(BUDGET_LINE_SLUGS).find(([, s]) => s === slug);
    return entry ? (entry[0] as BudgetLine) : null;
  });
  const property = data.properties.find((p) => p.id === currentPropertyId);

  const categories = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  );
  // Groupes de synthèse des catégories paramétrées (Loyers, Copropriété…), dans leur ordre.
  const groups = useMemo(
    () => [...new Set(data.categories.map((c) => c.group))],
    [data.categories],
  );
  const years = useMemo(
    () =>
      [
        ...new Set(
          data.transactions
            .filter((t) => t.propertyId === currentPropertyId)
            .map((t) => t.date.slice(0, 4)),
        ),
      ]
        .sort()
        .reverse(),
    [data.transactions, currentPropertyId],
  );

  const filtered = useMemo(
    () =>
      data.transactions
        .filter(
          (t) =>
            t.propertyId === currentPropertyId &&
            (!yearFilter || t.date.startsWith(yearFilter)) &&
            (!groupFilter || categories.get(t.categoryId)?.group === groupFilter) &&
            (!categoryFilter || t.categoryId === categoryFilter) &&
            (!toReviewOnly ||
              categories.get(t.categoryId)?.taxTreatment['lmnp-reel'] === 'to-review') &&
            (!budgetLine ||
              (property !== undefined &&
                categories.has(t.categoryId) &&
                budgetLineOf(categories.get(t.categoryId)!, property) === budgetLine)),
        )
        // Du plus récent au plus ancien.
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [
      data.transactions,
      categories,
      currentPropertyId,
      yearFilter,
      groupFilter,
      categoryFilter,
      toReviewOnly,
      budgetLine,
      property,
    ],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of filtered) {
      const direction = categories.get(t.categoryId)?.direction;
      if (direction === 'income') income += t.amount;
      if (direction === 'expense') expense += t.amount;
    }
    return { income, expense };
  }, [filtered, categories]);

  if (data.properties.length === 0) {
    return (
      <section className="card">
        <h2>Opérations</h2>
        <p>Crée d’abord un bien : chaque opération y est rattachée.</p>
        <a className="button primary" href={propertyHref('informations')}>
          Créer un bien
        </a>
      </section>
    );
  }

  const remove = async (t: Transaction) => {
    const category = categories.get(t.categoryId);
    const ok = window.confirm(
      `Supprimer cette opération ?\n\n${formatDate(t.date)} · ${category?.name ?? ''} · ${formatEuros(t.amount)}\n${t.label}\n\nCette action est définitive.`,
    );
    if (!ok) return;
    await db.transactions.delete(t.id);
    if (editing?.mode === 'edit' && editing.transaction.id === t.id) setEditing(null);
    setMessage('Opération supprimée.');
  };

  /** Bien sans aucune opération : ni filtres ni totaux, seulement le message et le bouton. */
  const isEmpty = !data.transactions.some((t) => t.propertyId === currentPropertyId);
  const hasFilter = Boolean(
    yearFilter || groupFilter || categoryFilter || toReviewOnly || budgetLine,
  );

  return (
    <div className="stack">
      <div className="toolbar title-toolbar">
        <PropertyTitle title="Opérations" />
        {!editing && (
          <button
            type="button"
            className="button primary"
            aria-label="Nouvelle opération"
            onClick={() => {
              setMessage(null);
              setEditing({ mode: 'new' });
            }}
          >
            {/* Sur téléphone, libellé court pour laisser la place au titre-sélecteur. */}
            <span className="label-wide">Nouvelle opération</span>
            <span className="label-narrow" aria-hidden="true">
              + Nouvelle
            </span>
          </button>
        )}
      </div>

      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}

      {editing && (
        <TransactionForm
          key={editing.mode === 'edit' ? editing.transaction.id : 'new'}
          data={data}
          initial={editing.mode === 'edit' ? editing.transaction : null}
          defaultPropertyId={currentPropertyId ?? data.properties[0]!.id}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={setMessage}
        />
      )}

      {isEmpty ? (
        <p className="card muted">Aucune opération pour l’instant.</p>
      ) : (
        <>
          <section className="card filters" aria-label="Filtres">
            <label className="field">
              <span>Année</span>
              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="">Toutes</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Groupe</span>
              <select
                value={groupFilter}
                onChange={(e) => {
                  setGroupFilter(e.target.value);
                  setCategoryFilter('');
                }}
              >
                <option value="">Tous</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Catégorie</span>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">Toutes</option>
                {sortCategories(
                  data.categories.filter((c) => !groupFilter || c.group === groupFilter),
                ).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {hasFilter && (
              <button
                type="button"
                className="button link"
                onClick={() => {
                  setYearFilter('');
                  setGroupFilter('');
                  setCategoryFilter('');
                  setToReviewOnly(false);
                  setBudgetLine(null);
                }}
              >
                Effacer les filtres
              </button>
            )}
          </section>

          {toReviewOnly && (
            <p className="warning" role="status">
              Seules les opérations « À valider » sont affichées : elles ne sont pas retenues dans
              le résultat fiscal tant qu’elles ne sont pas qualifiées (charge déductible ou
              investissement à amortir). Modifie leur catégorie une fois la réponse du comptable
              obtenue.{' '}
              <button type="button" className="button link" onClick={() => setToReviewOnly(false)}>
                Voir toutes les opérations
              </button>
            </p>
          )}

          {budgetLine && (
            <p className="muted" role="status">
              Ligne « {BUDGET_ROW_LABELS[budgetLine]} » du budget.{' '}
              <button type="button" className="button link" onClick={() => setBudgetLine(null)}>
                Voir toutes les opérations
              </button>
            </p>
          )}

          <p className="muted summary">
            {filtered.length} opération{filtered.length > 1 ? 's' : ''} · recettes{' '}
            {formatEuros(totals.income)} · dépenses {formatEuros(totals.expense)}
          </p>

          {filtered.length === 0 ? (
            <p className="card muted">Aucune opération ne correspond aux filtres.</p>
          ) : (
            <ul className="transactions">
              {filtered.map((t) => {
                const category = categories.get(t.categoryId);
                const direction = category?.direction ?? 'neutral';
                return (
                  <li key={t.id} className="transaction">
                    <span className="tx-date">{formatDate(t.date)}</span>
                    <span className="tx-main">
                      <strong>{category?.name ?? t.categoryId}</strong>
                      <span className="muted small">
                        {[t.label, t.account].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className={`tx-amount ${direction}`}>{signedAmount(t, category)}</span>
                    <span className="tx-actions">
                      <button
                        type="button"
                        className="button small"
                        onClick={() => {
                          setMessage(null);
                          setEditing({ mode: 'edit', transaction: t });
                          window.scrollTo(0, 0);
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="button small danger"
                        onClick={() => remove(t)}
                      >
                        Supprimer
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
