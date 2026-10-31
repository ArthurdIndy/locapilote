import { useEffect, useRef, useState, type FormEvent } from 'react';
import { db } from '../../db/database';
import type { Dataset, Transaction } from '../../engine/types';
import { CategoryPicker } from '../components/CategoryPicker';
import { centsToInput, formatEuros, parseEurosInput } from '../format';

interface Props {
  data: Dataset;
  /** Mouvement à modifier, ou null pour une nouvelle saisie. */
  initial: Transaction | null;
  defaultPropertyId: string;
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Compte du dernier mouvement (par date) de ce bien : souvent le bon pour la saisie suivante. */
function lastAccount(data: Dataset, propertyId: string): string {
  let last: Transaction | null = null;
  for (const t of data.transactions) {
    if (t.propertyId === propertyId && (!last || t.date >= last.date)) last = t;
  }
  return last?.account ?? 'Banque';
}

export function TransactionForm({
  data,
  initial,
  defaultPropertyId,
  today,
  onClose,
  onSaved,
}: Props) {
  const propertyId0 = initial?.propertyId ?? defaultPropertyId;
  const [date, setDate] = useState(initial?.date ?? today);
  const [propertyId, setPropertyId] = useState(propertyId0);
  const [account, setAccount] = useState(initial?.account ?? lastAccount(data, propertyId0));
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amount) : '');
  const [attachment, setAttachment] = useState(initial?.document ?? '');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const categoryRef = useRef<HTMLInputElement>(null);

  // Nouvelle saisie : date, bien et compte sont pré-remplis, on commence par la catégorie.
  useEffect(() => {
    if (!initial) categoryRef.current?.focus();
  }, [initial]);

  const accounts = [...new Set(data.transactions.map((t) => t.account))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!ISO_DATE.test(date)) problems.push('Indique la date.');
    if (!account.trim()) problems.push('Indique le compte (Banque, Agence…).');
    if (!categoryId) problems.push('Choisis une catégorie dans la liste.');
    const cents = parseEurosInput(amount);
    if (cents === null) problems.push('Montant invalide (ex. : 1054,89).');
    else if (cents === 0) problems.push('Le montant ne peut pas être nul.');
    setErrors(problems);
    if (problems.length > 0 || cents === null || !categoryId) return;

    const transaction: Transaction = {
      id: initial?.id ?? crypto.randomUUID(),
      propertyId,
      date,
      account: account.trim(),
      categoryId,
      label: label.trim(),
      amount: cents,
      document: attachment.trim() || null,
      source: initial ? initial.source : 'Saisie',
      comment: comment.trim() || null,
    };
    setSaving(true);
    try {
      await db.saveTransaction(transaction);
    } catch (e) {
      setErrors([`Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}`]);
      setSaving(false);
      return;
    }
    setSaving(false);
    const category = data.categories.find((c) => c.id === categoryId);
    const summary = `${category?.name ?? ''} · ${formatEuros(cents)}`;
    if (initial) {
      onSaved(`Mouvement modifié (${summary}).`);
      onClose();
    } else {
      // On garde date, bien et compte pour enchaîner les saisies.
      onSaved(`Mouvement enregistré (${summary}). Tu peux saisir le suivant.`);
      setCategoryId(null);
      setLabel('');
      setAmount('');
      setAttachment('');
      setComment('');
      categoryRef.current?.focus();
    }
  };

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>{initial ? 'Modifier le mouvement' : 'Nouveau mouvement'}</h2>
      <div className="row">
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        {data.properties.length > 1 ? (
          <label className="field">
            <span>Bien</span>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              {data.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>Compte</span>
            <AccountInput value={account} onChange={setAccount} accounts={accounts} />
          </label>
        )}
      </div>
      {data.properties.length > 1 && (
        <label className="field">
          <span>Compte</span>
          <AccountInput value={account} onChange={setAccount} accounts={accounts} />
        </label>
      )}
      <CategoryPicker
        ref={categoryRef}
        label="Catégorie"
        categories={data.categories}
        value={categoryId}
        onChange={setCategoryId}
      />
      <label className="field">
        <span>Libellé</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex. : Loyer novembre"
        />
      </label>
      <label className="field">
        <span>Montant (€)</span>
        <input
          className="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
        />
        <span className="muted small">
          Toujours positif ; le sens vient de la catégorie. Négatif seulement pour une annulation ou
          une remise.
        </span>
      </label>
      <details open={Boolean(initial?.document || initial?.comment)}>
        <summary>Pièce et commentaire</summary>
        <label className="field">
          <span>Pièce (référence ou nom du fichier)</span>
          <input value={attachment} onChange={(e) => setAttachment(e.target.value)} />
        </label>
        <label className="field">
          <span>Commentaire</span>
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
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
          Enregistrer
        </button>
        <button type="button" className="button" onClick={onClose}>
          {initial ? 'Annuler' : 'Fermer'}
        </button>
      </div>
    </form>
  );
}

function AccountInput({
  value,
  onChange,
  accounts,
}: {
  value: string;
  onChange: (v: string) => void;
  accounts: string[];
}) {
  return (
    <>
      <input list="locapilote-accounts" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="locapilote-accounts">
        {accounts.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </>
  );
}
