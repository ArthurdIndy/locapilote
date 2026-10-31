import { useMemo, useState } from 'react';
import { db } from '../../db/database';
import type { Category, Dataset, Transaction } from '../../engine/types';
import { formatDate, formatEuros } from '../format';
import { sortCategories } from '../labels';
import { routeHref } from '../router';
import { TransactionForm } from './TransactionForm';

type Editing = { mode: 'new' } | { mode: 'edit'; transaction: Transaction } | null;

interface Props {
  data: Dataset;
  currentPropertyId: string | null;
  today: string;
}

/** Montant signé pour l'affichage : + pour une recette, − pour une dépense. */
function signedAmount(t: Transaction, category: Category | undefined): string {
  const amount = formatEuros(t.amount);
  if (category?.direction === 'income') return t.amount < 0 ? amount : `+${amount}`;
  if (category?.direction === 'expense') {
    return t.amount < 0 ? `+${formatEuros(-t.amount)}` : `−${amount}`;
  }
  return amount;
}

export function TransactionsPage({ data, currentPropertyId, today }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const categories = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  );
  const properties = useMemo(
    () => new Map(data.properties.map((p) => [p.id, p])),
    [data.properties],
  );
  const years = useMemo(
    () => [...new Set(data.transactions.map((t) => t.date.slice(0, 4)))].sort().reverse(),
    [data.transactions],
  );

  const filtered = useMemo(
    () =>
      data.transactions
        .filter(
          (t) =>
            (!propertyFilter || t.propertyId === propertyFilter) &&
            (!yearFilter || t.date.startsWith(yearFilter)) &&
            (!categoryFilter || t.categoryId === categoryFilter),
        )
        // Du plus récent au plus ancien.
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [data.transactions, propertyFilter, yearFilter, categoryFilter],
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
        <h2>Mouvements</h2>
        <p>Crée d’abord un bien : chaque mouvement y est rattaché.</p>
        <a className="button primary" href={routeHref('biens')}>
          Créer un bien
        </a>
      </section>
    );
  }

  const remove = async (t: Transaction) => {
    const category = categories.get(t.categoryId);
    const ok = window.confirm(
      `Supprimer ce mouvement ?\n\n${formatDate(t.date)} · ${category?.name ?? ''} · ${formatEuros(t.amount)}\n${t.label}\n\nCette action est définitive.`,
    );
    if (!ok) return;
    await db.transactions.delete(t.id);
    if (editing?.mode === 'edit' && editing.transaction.id === t.id) setEditing(null);
    setMessage('Mouvement supprimé.');
  };

  const hasFilter = Boolean(propertyFilter || yearFilter || categoryFilter);

  return (
    <div className="stack">
      <div className="toolbar">
        <h2>Mouvements</h2>
        {!editing && (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setMessage(null);
              setEditing({ mode: 'new' });
            }}
          >
            Nouveau mouvement
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

      <section className="card filters" aria-label="Filtres">
        {data.properties.length > 1 && (
          <label className="field">
            <span>Bien</span>
            <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
              <option value="">Tous les biens</option>
              {data.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
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
          <span>Catégorie</span>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Toutes</option>
            {sortCategories(data.categories).map((c) => (
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
              setPropertyFilter('');
              setYearFilter('');
              setCategoryFilter('');
            }}
          >
            Effacer les filtres
          </button>
        )}
      </section>

      <p className="muted summary">
        {filtered.length} mouvement{filtered.length > 1 ? 's' : ''} · recettes{' '}
        {formatEuros(totals.income)} · dépenses {formatEuros(totals.expense)}
      </p>

      {filtered.length === 0 ? (
        <p className="card muted">
          {data.transactions.length === 0
            ? 'Aucun mouvement pour l’instant. Clique sur « Nouveau mouvement ».'
            : 'Aucun mouvement ne correspond aux filtres.'}
        </p>
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
                    {[
                      t.label,
                      t.account,
                      data.properties.length > 1 ? properties.get(t.propertyId)?.name : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
                  <button type="button" className="button small danger" onClick={() => remove(t)}>
                    Supprimer
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
