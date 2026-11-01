import { useState, type FormEvent } from 'react';
import { lastInstallmentDate } from '../../engine/core/loan';
import type { Loan } from '../../engine/types';
import {
  centsToInput,
  formatDate,
  parseEurosInput,
  parsePercentInput,
  rateToInput,
} from '../format';

interface Props {
  propertyId: string;
  initial: Loan | null;
  onSave: (loan: Loan) => Promise<void>;
  onCancel: () => void;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Création ou modification d'un prêt : banque, montant, taux, durée, dates, assurance. */
export function LoanForm({ propertyId, initial, onSave, onCancel }: Props) {
  const [bank, setBank] = useState(initial?.bank ?? '');
  const [label, setLabel] = useState(initial?.label ?? 'Prêt immobilier');
  const [principal, setPrincipal] = useState(initial ? centsToInput(initial.principal) : '');
  const [rate, setRate] = useState(initial ? rateToInput(initial.annualRate) : '');
  const [duration, setDuration] = useState(initial ? String(initial.durationMonths) : '');
  const [firstDate, setFirstDate] = useState(initial?.firstInstallmentDate ?? '');
  const [insurance, setInsurance] = useState(
    initial && initial.monthlyInsurance !== 0 ? centsToInput(initial.monthlyInsurance) : '',
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const months = /^\d+$/.test(duration.trim()) ? Number(duration) : null;
  const lastDate =
    months !== null && months > 0 && ISO_DATE.test(firstDate)
      ? lastInstallmentDate(firstDate, months)
      : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: string[] = [];
    const cents = parseEurosInput(principal);
    const annualRate = parsePercentInput(rate);
    const insuranceCents = insurance.trim() === '' ? 0 : parseEurosInput(insurance);
    if (!bank.trim()) problems.push('Indique la banque.');
    if (cents === null || cents <= 0) problems.push('Montant emprunté invalide (ex. : 170190).');
    if (annualRate === null || annualRate >= 0.5)
      problems.push('Taux invalide (ex. : 1,5 pour 1,5 %).');
    if (months === null || months <= 0 || months > 600) {
      problems.push('Durée invalide : nombre de mois (ex. : 240 pour 20 ans).');
    }
    if (!ISO_DATE.test(firstDate)) problems.push('Indique la date de la première échéance.');
    if (insuranceCents === null || insuranceCents < 0)
      problems.push('Assurance mensuelle invalide.');
    setErrors(problems);
    if (
      problems.length > 0 ||
      cents === null ||
      annualRate === null ||
      months === null ||
      insuranceCents === null ||
      !lastDate
    ) {
      return;
    }
    const loan: Loan = {
      ...(initial ?? {}),
      id: initial?.id ?? crypto.randomUUID(),
      propertyId,
      bank: bank.trim(),
      label: label.trim(),
      principal: cents,
      annualRate,
      durationMonths: months,
      firstInstallmentDate: firstDate,
      lastInstallmentDate: lastDate,
      monthlyInsurance: insuranceCents,
    };
    setSaving(true);
    try {
      await onSave(loan);
    } catch (e) {
      setErrors([`Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}`]);
      setSaving(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit} noValidate aria-label="Prêt">
      <h2>{initial ? 'Modifier le prêt' : 'Nouveau prêt'}</h2>
      <div className="row">
        <label className="field">
          <span>Banque *</span>
          <input value={bank} onChange={(e) => setBank(e.target.value)} />
        </label>
        <label className="field">
          <span>Libellé</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Montant emprunté (€) *</span>
          <input
            className="amount"
            inputMode="decimal"
            placeholder="0,00"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Taux annuel (%) *</span>
          <input
            className="amount"
            inputMode="decimal"
            placeholder="1,5"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Durée (mois) *</span>
          <input
            className="amount"
            inputMode="numeric"
            placeholder="240"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
          {months !== null && months > 0 && months % 12 === 0 && (
            <span className="muted small">soit {months / 12} ans</span>
          )}
        </label>
        <label className="field">
          <span>Assurance mensuelle (€)</span>
          <input
            className="amount"
            inputMode="decimal"
            placeholder="0,00"
            value={insurance}
            onChange={(e) => setInsurance(e.target.value)}
          />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Première échéance *</span>
          <input type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
        </label>
        <div className="field">
          <span>Dernière échéance</span>
          <p className="computed" aria-live="polite">
            <strong>{lastDate ? formatDate(lastDate) : '—'}</strong>
            <span className="muted small"> (calculée)</span>
          </p>
        </div>
      </div>
      {initial?.scheduleSource === 'estimated' && (
        <p className="muted small">
          L’échéancier de ce prêt est estimé : il sera recalculé avec ces paramètres.
        </p>
      )}
      {errors.length > 0 && (
        <ul className="error-text" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" className="button primary" disabled={saving}>
          {initial ? 'Enregistrer' : 'Créer le prêt'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
