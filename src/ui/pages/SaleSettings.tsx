import { useState, type FormEvent } from 'react';
import { db } from '../../db/database';
import type { PropertyAssumptions } from '../../engine/types';
import { DisclosureButton } from '../components/DisclosureButton';
import {
  centsToInput,
  formatEuros,
  formatPercent,
  parseEurosInput,
  parsePercentInput,
  rateToInput,
} from '../format';
import { useOpenDetails } from '../openDetails';

/**
 * « Paramètres de vente » (replié, avec un résumé d'une ligne) : frais d'agence, frais divers de
 * vente, indemnités de remboursement anticipé. Communs à tous les scénarios du bien.
 */
export function SaleSettings({ assumptions }: { assumptions: PropertyAssumptions }) {
  const details = useOpenDetails('locapilote.vente.parametresOuverts');
  const open = details.isOpen('parametres');
  const { sale } = assumptions;
  const initial = () => ({
    agencyFeesRate: rateToInput(sale.agencyFeesRate),
    otherSaleCosts: centsToInput(sale.otherSaleCosts),
    earlyRepaymentPenalty: centsToInput(sale.earlyRepaymentPenalty),
  });
  const [values, setValues] = useState(initial);
  const [source, setSource] = useState(sale);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  if (source !== sale) {
    setSource(sale);
    setValues(initial());
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const rate = parsePercentInput(values.agencyFeesRate);
    const costs = parseEurosInput(values.otherSaleCosts);
    const penalty = parseEurosInput(values.earlyRepaymentPenalty);
    const problems: string[] = [];
    if (rate === null) problems.push('Frais d’agence : pourcentage invalide.');
    if (costs === null || costs < 0) problems.push('Frais divers de vente : montant invalide.');
    if (penalty === null || penalty < 0)
      problems.push('Indemnités de remboursement anticipé : montant invalide.');
    setErrors(problems);
    setMessage(null);
    if (rate === null || costs === null || penalty === null || problems.length > 0) return;
    await db.saveAssumptions({
      ...assumptions,
      sale: { agencyFeesRate: rate, otherSaleCosts: costs, earlyRepaymentPenalty: penalty },
    });
    setMessage('Paramètres de vente enregistrés.');
  };

  const field = (key: keyof typeof values, label: string, help: string) => (
    <label className="field">
      <span>{label}</span>
      <input
        className="amount"
        inputMode="decimal"
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
      <span className="muted small">{help}</span>
    </label>
  );

  return (
    <section className="card stack" aria-label="Paramètres de vente">
      <h3>
        <DisclosureButton
          label="Paramètres de vente"
          open={open}
          onToggle={() => details.toggle('parametres')}
        />
      </h3>
      <p className="muted small" data-testid="resume-parametres">
        Frais d’agence {formatPercent(sale.agencyFeesRate)} · frais divers de vente{' '}
        {formatEuros(sale.otherSaleCosts)} · indemnités de remboursement anticipé{' '}
        {formatEuros(sale.earlyRepaymentPenalty)}
      </p>
      {open && (
        <form className="form stack" onSubmit={submit} noValidate aria-label="Paramètres de vente">
          <div className="assumptions-grid">
            {field(
              'agencyFeesRate',
              'Frais d’agence à ta charge (% du prix)',
              '0 % si l’acheteur les paie.',
            )}
            {field(
              'otherSaleCosts',
              'Frais divers de vente (€)',
              'Diagnostics, état daté, mainlevée.',
            )}
            {field(
              'earlyRepaymentPenalty',
              'Indemnités de remboursement anticipé (€)',
              'Souvent exclues en cas de vente : à vérifier dans l’offre de prêt.',
            )}
          </div>
          {errors.length > 0 && (
            <ul className="error-text" role="alert">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          <div className="actions">
            <button type="submit" className="button primary">
              Enregistrer les paramètres
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
