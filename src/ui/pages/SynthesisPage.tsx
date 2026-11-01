import { useState } from 'react';
import { db } from '../../db/database';
import { effectiveDataAsOf } from '../../db/defaultAssumptions';
import { propertySynthesis, type YearSynthesis } from '../../engine/core/synthesis';
import { isValidIsoDate } from '../../engine/dates';
import type { Dataset, Property } from '../../engine/types';
import { formatDate, formatDecimal, formatEuros, formatPercent } from '../format';
import { routeHref } from '../router';
import { TaxSection } from './TaxSection';

interface Props {
  data: Dataset;
  property: Property | null;
  today: string;
}

interface Line {
  label: string;
  value: (y: YearSynthesis) => string;
  /** Ligne de détail (« dont »), en retrait. */
  detail?: boolean;
  /** Ligne de total, en gras. */
  strong?: boolean;
  /** Couleur selon le signe. */
  signed?: (y: YearSynthesis) => number;
}

interface Section {
  title: string;
  lines: Line[];
}

const euros = (cents: number | null) => (cents === null ? '—' : formatEuros(Math.round(cents)));
const percent = (rate: number | null) => (rate === null ? '—' : formatPercent(rate));

const SECTIONS: Section[] = [
  {
    title: 'Trésorerie',
    lines: [
      { label: 'Recettes encaissées', value: (y) => euros(y.income) },
      { label: 'Dépenses payées (hors prêt)', value: (y) => euros(y.expenses) },
      { label: 'Échéances de prêt (période louée)', value: (y) => euros(y.loanPayments) },
      { label: 'dont capital', value: (y) => euros(y.principalRepaid), detail: true },
      { label: 'dont intérêts', value: (y) => euros(y.loanInterest), detail: true },
      { label: 'dont assurance', value: (y) => euros(y.loanInsurance), detail: true },
      {
        label: 'Cash-flow',
        value: (y) => euros(y.cashFlow),
        strong: true,
        signed: (y) => y.cashFlow,
      },
      { label: 'Mois de location', value: (y) => formatDecimal(y.rentalMonths) },
      {
        label: 'Cash-flow mensuel moyen',
        value: (y) => euros(y.monthlyCashFlow),
        signed: (y) => y.monthlyCashFlow ?? 0,
      },
      { label: 'Capital remboursé', value: (y) => euros(y.principalRepaid) },
      {
        label: 'Enrichissement (cash-flow + capital remboursé)',
        value: (y) => euros(y.wealthGain),
        strong: true,
        signed: (y) => y.wealthGain,
      },
    ],
  },
  {
    title: 'Rentabilité',
    lines: [
      { label: 'Loyers hors charges', value: (y) => euros(y.rent) },
      { label: 'Loyers annualisés', value: (y) => euros(y.annualizedRent) },
      { label: 'Rendement brut', value: (y) => percent(y.grossYield), strong: true },
      {
        label: 'Rendement net (avant financement)',
        value: (y) => percent(y.netYield),
        strong: true,
      },
    ],
  },
  {
    title: 'Patrimoine',
    lines: [
      { label: 'Capital restant dû au 31/12', value: (y) => euros(y.outstandingAtYearEnd) },
      {
        label: 'Valeur estimée moins capital restant dû',
        value: (y) => euros(y.equity),
        strong: true,
      },
    ],
  },
];

function signClass(line: Line, y: YearSynthesis): string | undefined {
  if (!line.signed) return undefined;
  const v = line.signed(y);
  return v < 0 ? 'negative' : v > 0 ? 'positive' : undefined;
}

export function SynthesisPage({ data, property, today }: Props) {
  const [dateError, setDateError] = useState<string | null>(null);

  if (!property) {
    return (
      <section className="card">
        <h2>Synthèse</h2>
        <p>Crée d’abord un bien.</p>
        <a className="button primary" href={routeHref('biens')}>
          Créer un bien
        </a>
      </section>
    );
  }

  const asOf = effectiveDataAsOf(data.assumptions, property.id, today);
  const years = propertySynthesis(data, property, asOf.date);
  const lastYear = years.at(-1);
  const partialLastYear = lastYear !== undefined && asOf.date < `${lastYear.year}-12-31`;

  const changeDate = async (value: string) => {
    if (!isValidIsoDate(value)) {
      setDateError('Date invalide.');
      return;
    }
    setDateError(null);
    await db.setDataAsOf(property.id, value);
  };

  return (
    <div className="stack">
      <h2>Synthèse · {property.name}</h2>

      <section className="card form" aria-label="Date de mise à jour des données">
        <label className="field data-as-of">
          <span>Données à jour au</span>
          <input type="date" value={asOf.date} onChange={(e) => changeDate(e.target.value)} />
        </label>
        <p className="muted small">
          {asOf.isDefault ? 'Par défaut, la date du jour. ' : ''}
          Date jusqu’à laquelle tes mouvements sont saisis : les années suivantes ne sont pas
          affichées, et les échéances de prêt sont comptées jusqu’à cette date.
        </p>
        {dateError && <p className="error-text">{dateError}</p>}
      </section>

      {!property.rentalStartDate ? (
        <p className="card">
          Indique la date de mise en location du bien (page <a href={routeHref('biens')}>Biens</a>)
          pour voir sa synthèse.
        </p>
      ) : years.length === 0 ? (
        <p className="card">
          Le bien est loué à partir du {formatDate(property.rentalStartDate)}, après la date de mise
          à jour des données : rien à afficher pour l’instant.
        </p>
      ) : (
        <>
          {partialLastYear && (
            <p className="muted small">
              {lastYear.year} : année en cours, chiffres arrêtés au {formatDate(asOf.date)}. Le
              rendement est annualisé sur les mois de location.
            </p>
          )}

          {/* Grand écran : un tableau, une colonne par année (comme l'Excel). */}
          <div className="synthesis-wide">
            <table className="synthesis-table" aria-label="Synthèse annuelle">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Indicateur</span>
                  </th>
                  {years.map((y) => (
                    <th key={y.year} scope="col">
                      {y.year}
                    </th>
                  ))}
                </tr>
              </thead>
              {SECTIONS.map((section) => (
                <tbody key={section.title}>
                  <tr className="section-row">
                    <th scope="rowgroup" colSpan={years.length + 1}>
                      {section.title}
                    </th>
                  </tr>
                  {section.lines.map((line) => (
                    <tr
                      key={line.label}
                      className={[line.detail && 'detail', line.strong && 'strong']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <th scope="row">{line.label}</th>
                      {years.map((y) => (
                        <td key={y.year} className={signClass(line, y)}>
                          {line.value(y)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          {/* Téléphone : une carte par année, la plus récente en premier. */}
          <div className="synthesis-narrow stack">
            {[...years].reverse().map((y) => (
              <section key={y.year} className="card year-card" aria-label={`Année ${y.year}`}>
                <h3>{y.year}</h3>
                {SECTIONS.map((section) => (
                  <div key={section.title}>
                    <h4>{section.title}</h4>
                    <dl className="year-lines">
                      {section.lines.map((line) => (
                        <div
                          key={line.label}
                          className={[line.detail && 'detail', line.strong && 'strong']
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <dt>{line.label}</dt>
                          <dd className={signClass(line, y)}>{line.value(y)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}

      <TaxSection data={data} property={property} dataAsOf={asOf.date} />
    </div>
  );
}
