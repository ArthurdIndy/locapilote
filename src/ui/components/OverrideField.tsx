import { useId, useState, type KeyboardEvent } from 'react';
import type { Resolved } from '../../engine/sale-defaults';
import { parseValue, showValue, valueToInput, type ValueKind } from '../valueFormat';

/**
 * Valeur calculée automatiquement, modifiable : vide (ou « Revenir au calcul automatique ») =
 * calcul automatique. Enregistrée en quittant le champ (ou avec Entrée).
 */
export function OverrideField({
  label,
  kind,
  resolved,
  help,
  onSave,
}: {
  label: string;
  kind: ValueKind;
  resolved: Resolved;
  help?: string;
  onSave: (value: number | null) => Promise<void>;
}) {
  const id = useId();
  const initial = resolved.modified ? valueToInput(kind, resolved.value) : '';
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
    const parsed = parseValue(kind, text);
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
        placeholder={valueToInput(kind, resolved.automatic)}
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
          ? `Valeur modifiée (calcul automatique : ${showValue(kind, resolved.automatic)}).`
          : `Calcul automatique : ${showValue(kind, resolved.automatic)}.`}
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
