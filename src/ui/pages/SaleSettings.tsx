import { useState, type FormEvent } from 'react';
import { db } from '../../db/database';
import type { ResolvedSaleAssumptions } from '../../engine/sale-defaults';
import type { ProjectionAssumptions, PropertyAssumptions } from '../../engine/types';
import { DisclosureButton } from '../components/DisclosureButton';
import { OverrideField } from '../components/OverrideField';
import { showValue } from '../valueFormat';
import {
  centsToInput,
  formatDate,
  formatEuros,
  formatPercent,
  parseEurosInput,
  parsePercentInput,
  rateToInput,
} from '../format';
import { useOpenDetails } from '../openDetails';

/**
 * « Paramètres de vente » (replié, avec un résumé d'une ligne), communs à tous les scénarios du
 * bien : frais d'agence, frais divers de vente, indemnités de remboursement anticipé, puis les
 * valeurs de projection d'ici la vente (calculées à partir du journal, modifiables).
 */
export function SaleSettings({
  assumptions,
  resolved,
}: {
  assumptions: PropertyAssumptions;
  resolved: ResolvedSaleAssumptions;
}) {
  const details = useOpenDetails('locapilote.vente.parametresOuverts');
  const fromBudget = resolved.projectionSource.kind === 'budget';
  const budgetYears =
    resolved.projectionSource.kind === 'budget' ? resolved.projectionSource.years : [];
  // Une valeur modifiée reste prioritaire : la source n'est le budget que si l'une des deux
  // valeurs est calculée.
  const sourceLabel =
    resolved.netRentMonthly.modified && resolved.annualExpensesExcludingLoan.modified
      ? 'valeurs modifiées'
      : fromBudget
        ? `d’après ${budgetYears.length > 1 ? 'les budgets' : 'le budget'} ${budgetYears.join(', ')}`
        : '12 derniers mois';
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

  const saveProjection = (patch: Partial<ProjectionAssumptions>) =>
    db.saveAssumptions({ ...assumptions, projection: { ...assumptions.projection, ...patch } });

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
        {formatEuros(sale.earlyRepaymentPenalty)} · loyer net projeté{' '}
        {showValue('euros', resolved.netRentMonthly.value)}/mois · dépenses projetées{' '}
        {showValue('euros', resolved.annualExpensesExcludingLoan.value)}/an ({sourceLabel}) ·
        évolution {showValue('percent', resolved.annualGrowth.value)}/an · frais de l’année de la
        vente {showValue('euros', resolved.saleYearCosts.value)}
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
      {open && (
        <div className="stack" aria-label="Projection d’ici la vente" role="group">
          <h4>Projection d’ici la vente</h4>
          <p className="muted small">
            Loyers et dépenses des mois suivant la date des données
            {resolved.journalWindow ? ` (${formatDate(resolved.journalWindow.to)})` : ''} jusqu’à la
            vente. Valeurs calculées {fromBudget ? 'd’après le budget' : 'à partir du journal'},
            communes à toutes les dates ; tu peux les modifier (vide = calcul automatique).
          </p>
          <div className="assumptions-grid">
            <OverrideField
              label="Loyer net projeté (€ / mois)"
              kind="euros"
              resolved={resolved.netRentMonthly}
              help={
                fromBudget
                  ? `Budget ${budgetYears[0]} : loyers et charges perçus − gestion et comptable, / 12.`
                  : resolved.journalWindow
                    ? `Recettes du ${formatDate(resolved.journalWindow.from)} au ${formatDate(resolved.journalWindow.to)} / 12.`
                    : 'Bien pas encore loué.'
              }
              onSave={(v) => saveProjection({ netRentMonthly: v })}
            />
            <OverrideField
              label="Dépenses projetées (€ / an, hors prêt)"
              kind="euros"
              resolved={resolved.annualExpensesExcludingLoan}
              help={
                fromBudget
                  ? `Budget ${budgetYears[0]} : copropriété, impôts et taxes, assurances, entretien.`
                  : 'Dépenses payées sur la même période. Exclues : dépenses immobilisées (« À amortir ») et catégories de travaux, y compris travaux de copropriété.'
              }
              onSave={(v) => saveProjection({ annualExpensesExcludingLoan: v })}
            />
            <OverrideField
              label="Évolution annuelle des loyers et des charges (%)"
              kind="percent"
              resolved={resolved.annualGrowth}
              onSave={(v) => saveProjection({ annualGrowth: v })}
            />
            <OverrideField
              label="Frais de l’année de la vente (€)"
              kind="euros"
              resolved={resolved.saleYearCosts}
              help={`Honoraires du comptable de ${resolved.lastCompleteYear}.`}
              onSave={(v) => saveProjection({ saleYearCosts: v })}
            />
          </div>
        </div>
      )}
    </section>
  );
}
