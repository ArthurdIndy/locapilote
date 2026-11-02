import { useState, type FormEvent } from 'react';
import { db } from '../../db/database';
import { HOUSEHOLD_SETTINGS_ID, type Dataset } from '../../engine/types';
import { formatPercent, parsePercentInput, rateToInput } from '../format';

/**
 * Placement de référence (paramètre du foyer) : taux annuel et libellé, sans valeur par
 * défaut. Sert à comparer la rentabilité réelle du bien (Synthèse, Simulations › Vente).
 */
export function ReferenceInvestmentForm({ data }: { data: Dataset }) {
  const saved = data.householdSettings[0];
  const [rate, setRate] = useState(
    saved?.referenceRate != null ? rateToInput(saved.referenceRate) : '',
  );
  const [label, setLabel] = useState(saved?.referenceLabel ?? '');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const trimmed = rate.trim();
    const parsed = trimmed === '' ? null : parsePercentInput(trimmed);
    if (trimmed !== '' && parsed === null) {
      setError('Le taux doit être un pourcentage, par exemple 3 ou 2,5.');
      return;
    }
    setError(null);
    await db.saveHouseholdSettings({
      id: HOUSEHOLD_SETTINGS_ID,
      referenceRate: parsed,
      referenceLabel: label.trim(),
    });
    setMessage(
      parsed === null
        ? 'Placement de référence effacé.'
        : `Placement de référence enregistré : ${label.trim() || 'placement'} à ${formatPercent(parsed)} par an.`,
    );
  };

  return (
    <form className="card form" onSubmit={submit} noValidate aria-label="Placement de référence">
      <h3>Placement de référence</h3>
      <p className="muted small">
        Pour savoir si ton bien rapporte plus que ton argent placé ailleurs : son TRI est comparé à
        ce taux (Synthèse, Simulations › Vente). Aucune valeur n’est imposée ; mets le rendement
        annuel net que tu obtiendrais vraiment (fonds euros, ETF, livret…).
      </p>
      <div className="row">
        <label className="field">
          <span>Libellé</span>
          <input
            value={label}
            placeholder="fonds euros, ETF…"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Taux annuel (%)</span>
          <input
            className="amount"
            inputMode="decimal"
            placeholder="ex. 3"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button primary">
          Enregistrer le placement
        </button>
      </div>
    </form>
  );
}
