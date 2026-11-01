import { useState, type ChangeEvent } from 'react';
import { parseScheduleText, type ParsedSchedule } from '../../engine/core/loanImport';
import type { Loan } from '../../engine/types';
import { formatDate, formatEuros } from '../format';

interface Props {
  loan: Loan;
  existingCount: number;
  onImport: (parsed: ParsedSchedule) => Promise<void>;
  onClose: () => void;
}

/** Chargement du tableau d'amortissement de la banque : copier-coller depuis Excel, ou CSV. */
export function ScheduleImport({ loan, existingCount, onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedSchedule | null>(null);
  const [busy, setBusy] = useState(false);

  const analyse = (value: string) => {
    setText(value);
    setParsed(value.trim() ? parseScheduleText(value, loan) : null);
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) analyse(await file.text());
  };

  const confirm = async () => {
    if (!parsed || parsed.installments.length === 0) return;
    if (
      existingCount > 0 &&
      !window.confirm(
        `Remplacer les ${existingCount} échéances actuelles par les ${parsed.installments.length} du tableau ?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await onImport(parsed);
    } finally {
      setBusy(false);
    }
  };

  const rows = parsed?.installments ?? [];
  const sum = (pick: (i: (typeof rows)[number]) => number) => rows.reduce((s, i) => s + pick(i), 0);

  return (
    <section className="card form" aria-label="Charger le tableau de la banque">
      <h3>Charger le tableau d’amortissement de la banque</h3>
      <p className="small">
        Dans Excel, sélectionne les colonnes{' '}
        <strong>date, capital dû, capital, intérêts, assurance</strong> (dans cet ordre, avec ou
        sans ligne de titres), copie, puis colle ici. Tu peux aussi choisir un fichier CSV avec les
        mêmes colonnes.
      </p>
      <label className="field">
        <span>Tableau collé</span>
        <textarea
          rows={6}
          value={text}
          onChange={(e) => analyse(e.target.value)}
          placeholder={'05/12/2017\t170 190,00\t608,51\t196,31\t18,75\n05/01/2018\t169 581,49\t…'}
          spellCheck={false}
        />
      </label>
      <label className="field">
        <span>ou un fichier CSV</span>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={readFile} />
      </label>

      {parsed && parsed.errors.length > 0 && (
        <ul className="error-text" role="alert">
          {parsed.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="import-preview" role="status">
          <p>
            <strong>{rows.length} échéances</strong> du {formatDate(rows[0]!.date)} au{' '}
            {formatDate(rows.at(-1)!.date)} : capital {formatEuros(sum((i) => i.principal))},
            intérêts {formatEuros(sum((i) => i.interest))}, assurance{' '}
            {formatEuros(sum((i) => i.insurance))}.
          </p>
          {parsed!.skippedLines.length > 0 && (
            <p className="muted small">
              Ligne{parsed!.skippedLines.length > 1 ? 's' : ''} ignorée
              {parsed!.skippedLines.length > 1 ? 's' : ''} (sans date) :{' '}
              {parsed!.skippedLines.slice(0, 5).join(', ')}
              {parsed!.skippedLines.length > 5 ? '…' : ''}
            </p>
          )}
        </div>
      )}
      {parsed && parsed.warnings.length > 0 && (
        <ul className="warning">
          {parsed.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button
          type="button"
          className="button primary"
          disabled={busy || rows.length === 0}
          onClick={confirm}
        >
          {rows.length > 0
            ? `Enregistrer les ${rows.length} échéances`
            : 'Enregistrer les échéances'}
        </button>
        <button type="button" className="button" onClick={onClose}>
          Annuler
        </button>
      </div>
    </section>
  );
}
