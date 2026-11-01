import { useState } from 'react';
import { db } from '../../db/database';
import {
  generateEstimatedSchedule,
  installmentsOf,
  loanYears,
  outstandingPrincipal,
} from '../../engine/core/loan';
import type { Dataset, Loan, Property } from '../../engine/types';
import { formatDate, formatEuros, formatPercent } from '../format';
import { routeHref } from '../router';
import { LoanForm } from './LoanForm';
import { ScheduleImport } from './ScheduleImport';

interface Props {
  data: Dataset;
  property: Property | null;
  today: string;
}

type Editing = { mode: 'new' } | { mode: 'edit'; loan: Loan } | null;

export function LoansPage({ data, property, today }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!property) {
    return (
      <section className="card">
        <h2>Prêt</h2>
        <p>Crée d’abord un bien : chaque prêt y est rattaché.</p>
        <a className="button primary" href={routeHref('biens')}>
          Créer un bien
        </a>
      </section>
    );
  }

  const loans = data.loans.filter((l) => l.propertyId === property.id);

  const save = async (loan: Loan) => {
    const isNew = editing?.mode === 'new';
    await db.saveLoan(loan);
    if (loan.scheduleSource === 'estimated') {
      await db.replaceLoanSchedule(loan.id, generateEstimatedSchedule(loan), 'estimated');
    }
    setMessage(
      isNew
        ? 'Prêt créé. Charge maintenant le tableau d’amortissement de la banque, ou génère un échéancier estimé.'
        : loan.scheduleSource === 'estimated'
          ? 'Prêt modifié, échéancier estimé recalculé.'
          : 'Prêt modifié.',
    );
    setEditing(null);
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <h2>Prêt · {property.name}</h2>
        {!editing && (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setMessage(null);
              setEditing({ mode: 'new' });
            }}
          >
            Ajouter un prêt
          </button>
        )}
      </div>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {editing && (
        <LoanForm
          key={editing.mode === 'edit' ? editing.loan.id : 'new'}
          propertyId={property.id}
          initial={editing.mode === 'edit' ? editing.loan : null}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {loans.length === 0 && !editing && (
        <p className="card muted">Aucun prêt pour ce bien. Clique sur « Ajouter un prêt ».</p>
      )}
      {loans.map((loan) => (
        <LoanCard
          key={loan.id}
          loan={loan}
          data={data}
          today={today}
          onEdit={() => {
            setMessage(null);
            setEditing({ mode: 'edit', loan });
            window.scrollTo(0, 0);
          }}
          onMessage={setMessage}
        />
      ))}
    </div>
  );
}

function LoanCard({
  loan,
  data,
  today,
  onEdit,
  onMessage,
}: {
  loan: Loan;
  data: Dataset;
  today: string;
  onEdit: () => void;
  onMessage: (m: string) => void;
}) {
  const [importing, setImporting] = useState(false);
  const [atDate, setAtDate] = useState(today);
  const installments = installmentsOf(loan, data.loanInstallments);
  const years = loanYears(loan, data.loanInstallments);
  const estimated = loan.scheduleSource === 'estimated';
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(atDate);

  const generate = async () => {
    if (
      installments.length > 0 &&
      !window.confirm(
        `Remplacer les ${installments.length} échéances actuelles par un échéancier estimé ?` +
          (estimated ? '' : '\n\nLe tableau de la banque sera effacé.'),
      )
    ) {
      return;
    }
    const schedule = generateEstimatedSchedule(loan);
    await db.replaceLoanSchedule(loan.id, schedule, 'estimated');
    onMessage(`Échéancier estimé généré : ${schedule.length} échéances.`);
  };

  const remove = async () => {
    if (
      !window.confirm(
        `Supprimer le prêt « ${loan.label || loan.bank} » et ses ${installments.length} échéances ?\n\nCette action est définitive.`,
      )
    ) {
      return;
    }
    await db.deleteLoan(loan.id);
    onMessage('Prêt supprimé.');
  };

  return (
    <section className="card stack" aria-label={`Prêt ${loan.bank}`}>
      <div className="toolbar">
        <div>
          <h3>
            {loan.label || 'Prêt'} · {loan.bank}
          </h3>
          <p className="muted small">
            {formatEuros(loan.principal)} à {formatPercent(loan.annualRate)} sur{' '}
            {loan.durationMonths} mois, du {formatDate(loan.firstInstallmentDate)} au{' '}
            {formatDate(loan.lastInstallmentDate)}
            {loan.monthlyInsurance > 0
              ? ` · assurance ${formatEuros(loan.monthlyInsurance)} / mois`
              : ''}
          </p>
        </div>
        {installments.length === 0 ? (
          <span className="badge">Pas d’échéancier</span>
        ) : estimated ? (
          <span className="badge estimated">Échéancier estimé</span>
        ) : (
          <span className="badge bank">Tableau de la banque</span>
        )}
      </div>

      {estimated && (
        <p className="warning small">
          Échéancier <strong>estimé</strong> à partir des paramètres du prêt : les montants peuvent
          différer de quelques euros de ceux de la banque. Charge le tableau de la banque dès que tu
          l’as : c’est lui qui fait foi.
        </p>
      )}

      <div className="actions">
        <button type="button" className="button" onClick={() => setImporting(true)}>
          Charger le tableau de la banque
        </button>
        <button type="button" className="button" onClick={generate}>
          Générer un échéancier estimé
        </button>
        <button type="button" className="button" onClick={onEdit}>
          Modifier
        </button>
        <button type="button" className="button danger" onClick={remove}>
          Supprimer
        </button>
      </div>

      {importing && (
        <ScheduleImport
          loan={loan}
          existingCount={installments.length}
          onClose={() => setImporting(false)}
          onImport={async (parsed) => {
            await db.replaceLoanSchedule(loan.id, parsed.installments, 'bank');
            setImporting(false);
            onMessage(`Tableau de la banque enregistré : ${parsed.installments.length} échéances.`);
          }}
        />
      )}

      {installments.length > 0 && (
        <>
          <div className="highlight">
            <label className="highlight-label" htmlFor={`crd-${loan.id}`}>
              Capital restant dû au
            </label>
            <input
              id={`crd-${loan.id}`}
              type="date"
              className="inline-date"
              value={atDate}
              onChange={(e) => setAtDate(e.target.value)}
            />
            <span className="highlight-value" data-testid="outstanding">
              {validDate
                ? formatEuros(outstandingPrincipal(loan, data.loanInstallments, atDate))
                : '—'}
            </span>
            <span className="muted small">
              Montant emprunté moins le capital des échéances payées jusqu’à cette date incluse.
            </span>
          </div>

          <h4>Par année</h4>
          <div className="table-scroll">
            <table className="responsive-table loan-years">
              <thead>
                <tr>
                  <th scope="col">Année</th>
                  <th scope="col" className="hide-narrow">
                    Échéances
                  </th>
                  <th scope="col">Capital</th>
                  <th scope="col">Intérêts</th>
                  <th scope="col">Assurance</th>
                  <th scope="col" className="hide-narrow">
                    Total
                  </th>
                  <th scope="col">Restant dû au 31/12</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year}>
                    <th scope="row" data-label="Année">
                      {y.year}
                    </th>
                    <td data-label="Échéances" className="hide-narrow">
                      {y.count}
                    </td>
                    <td data-label="Capital">{formatEuros(y.principal)}</td>
                    <td data-label="Intérêts">{formatEuros(y.interest)}</td>
                    <td data-label="Assurance">{formatEuros(y.insurance)}</td>
                    <td data-label="Total" className="hide-narrow">
                      {formatEuros(y.total)}
                    </td>
                    <td data-label="Restant dû au 31/12">{formatEuros(y.outstandingAtYearEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
