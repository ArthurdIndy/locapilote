import { Fragment } from 'react';
import { effectiveDataAsOf } from '../../db/defaultAssumptions';
import {
  coOwnershipChargesBorne,
  propertySynthesis,
  RENT_GROUP,
  yearGroupTotals,
  type GroupTotal,
  type YearSynthesis,
} from '../../engine/core/synthesis';
import { lmnpReelSummary } from '../../engine/tax/lmnp-reel';
import type { Category, Dataset, Property } from '../../engine/types';
import { formatDate, formatDecimal, formatEuros, formatPercent } from '../format';
import { propertyHref, routeHref } from '../router';
import { useOpenDetails } from '../openDetails';
import { DataAsOfBar } from './DataAsOfBar';

interface Props {
  data: Dataset;
  property: Property | null;
  today: string;
}

/** Ligne d'un détail replié ; `href` : lien vers les mouvements de cette ligne et de l'année. */
interface DetailRow {
  label: string;
  value: (y: YearSynthesis) => string;
  href?: (y: YearSynthesis) => string;
}

interface Line {
  label: string;
  value: (y: YearSynthesis) => string;
  /** Ligne de total, en gras. */
  strong?: boolean;
  /** Couleur selon le signe. */
  signed?: (y: YearSynthesis) => number;
  /** Détail replié (⊕), fermé par défaut ; `id` sert à mémoriser son état. */
  details?: { id: string; rows: DetailRow[] };
}

interface Section {
  title: string;
  lines: Line[];
  /** Lien vers une page de détail, affiché avec le titre du bloc. */
  link?: { href: string; label: string };
}

const euros = (cents: number | null) => (cents === null ? '—' : formatEuros(Math.round(cents)));
const percent = (rate: number | null) => (rate === null ? '—' : formatPercent(rate));

/** Totaux par groupe de chaque année, et groupes à détailler (ordre des catégories). */
interface Groups {
  byYear: Map<number, GroupTotal[]>;
  income: string[];
  expense: string[];
}

function groupRows(
  groups: Groups,
  direction: GroupTotal['direction'],
  propertyId: string,
): DetailRow[] {
  return groups[direction].map((group) => ({
    label: group,
    value: (y) =>
      euros(
        groups.byYear.get(y.year)?.find((g) => g.direction === direction && g.group === group)
          ?.amount ?? 0,
      ),
    href: (y) =>
      routeHref('mouvements', { bien: propertyId, annee: String(y.year), groupe: group }),
  }));
}

function buildSections(groups: Groups, propertyId: string): Section[] {
  const coOwnership = (y: YearSynthesis) =>
    coOwnershipChargesBorne(groups.byYear.get(y.year) ?? []);
  return [
    {
      title: 'Trésorerie',
      lines: [
        {
          label: 'Recettes encaissées',
          value: (y) => euros(y.income),
          details: { id: 'recettes', rows: groupRows(groups, 'income', propertyId) },
        },
        {
          label: 'Dépenses payées (hors prêt)',
          value: (y) => euros(y.expenses),
          details: { id: 'depenses', rows: groupRows(groups, 'expense', propertyId) },
        },
        {
          label: 'Échéances de prêt (période louée)',
          value: (y) => euros(y.loanPayments),
          details: {
            id: 'echeances',
            rows: [
              { label: 'dont capital', value: (y) => euros(y.principalRepaid) },
              { label: 'dont intérêts', value: (y) => euros(y.loanInterest) },
              { label: 'dont assurance', value: (y) => euros(y.loanInsurance) },
            ],
          },
        },
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
        {
          label: 'Charges de copropriété restant à ma charge',
          value: (y) => euros(coOwnership(y)),
        },
      ],
    },
    {
      title: 'Rentabilité',
      lines: [
        {
          label: 'Rendement brut',
          value: (y) => percent(y.grossYield),
          strong: true,
          details: {
            id: 'loyers',
            rows: [
              { label: 'Loyers hors charges', value: (y) => euros(y.rent) },
              { label: 'Loyers annualisés', value: (y) => euros(y.annualizedRent) },
            ],
          },
        },
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
}

/**
 * Bloc « Fiscalité » : le seul résultat fiscal estimé de chaque année ; le détail est sur la
 * page Fiscalité. `null` = régime pas encore calculé par Locapilote.
 */
function fiscalSection(taxResults: Map<number, number> | null): Section {
  return {
    title: 'Fiscalité',
    link: { href: routeHref('fiscalite'), label: 'Voir le détail fiscal' },
    lines: [
      {
        label: 'Résultat fiscal estimé',
        strong: true,
        value: (y) => {
          const result = taxResults?.get(y.year);
          if (result === undefined) return 'non disponible';
          return result < 0 ? `${formatEuros(result)} (déficit)` : formatEuros(result);
        },
        signed: (y) => Math.min(0, taxResults?.get(y.year) ?? 0),
      },
    ],
  };
}

function signClass(line: Line, y: YearSynthesis): string | undefined {
  if (!line.signed) return undefined;
  const v = line.signed(y);
  return v < 0 ? 'negative' : v > 0 ? 'positive' : undefined;
}

export function SynthesisPage({ data, property, today }: Props) {
  const details = useOpenDetails(OPEN_DETAILS_KEY);
  if (!property) {
    return (
      <section className="card">
        <h2>Synthèse</h2>
        <p>Crée d’abord un bien.</p>
        <a className="button primary" href={propertyHref('informations')}>
          Créer un bien
        </a>
      </section>
    );
  }

  const asOf = effectiveDataAsOf(data.assumptions, property.id, today);
  const years = propertySynthesis(data, property, asOf.date);
  const lastYear = years.at(-1);
  const partialLastYear = lastYear !== undefined && asOf.date < `${lastYear.year}-12-31`;
  const taxResults =
    property.taxRegime === 'lmnp-reel'
      ? new Map(lmnpReelSummary(data, property, asOf.date).map((t) => [t.year, t.taxResult]))
      : null;
  const byYear = new Map(years.map((y) => [y.year, yearGroupTotals(data, property, y.year)]));
  const groupNames = (direction: GroupTotal['direction']) =>
    sortGroups(
      data.categories.filter((c) => c.direction === direction),
      (byYear.values().next().value ?? [])
        .filter((g) => g.direction === direction)
        .map((g) => g.group),
    );
  const groups: Groups = { byYear, income: groupNames('income'), expense: groupNames('expense') };
  const sections = [...buildSections(groups, property.id), fiscalSection(taxResults)];

  return (
    <div className="stack">
      <h2>Synthèse · {property.name}</h2>

      <DataAsOfBar propertyId={property.id} date={asOf.date} isDefault={asOf.isDefault} />

      {!property.rentalStartDate ? (
        <p className="card">
          Indique la date de mise en location du bien (
          <a href={propertyHref('informations')}>Mon bien</a>) pour voir sa synthèse.
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
              {sections.map((section) => (
                <tbody key={section.title}>
                  <tr className="section-row">
                    <th scope="rowgroup" colSpan={years.length + 1}>
                      {section.title}
                      {section.link && (
                        <a className="section-link" href={section.link.href}>
                          {section.link.label}
                        </a>
                      )}
                    </th>
                  </tr>
                  {section.lines.map((line) => (
                    <Fragment key={line.label}>
                      <tr className={line.strong ? 'strong' : undefined}>
                        <th scope="row">
                          <LineLabel line={line} details={details} />
                        </th>
                        {years.map((y) => (
                          <td key={y.year} className={signClass(line, y)}>
                            {line.value(y)}
                          </td>
                        ))}
                      </tr>
                      {line.details &&
                        details.isOpen(line.details.id) &&
                        line.details.rows.map((row) => (
                          <tr key={row.label} className="detail">
                            <th scope="row">{row.label}</th>
                            {years.map((y) => (
                              <td key={y.year}>
                                {row.href ? (
                                  <a
                                    href={row.href(y)}
                                    aria-label={`${row.label} ${y.year} : ${row.value(y)}`}
                                  >
                                    {row.value(y)}
                                  </a>
                                ) : (
                                  row.value(y)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </Fragment>
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
                {sections.map((section) => (
                  <div key={section.title}>
                    <h4>
                      {section.title}
                      {section.link && (
                        <a className="section-link" href={section.link.href}>
                          {section.link.label}
                        </a>
                      )}
                    </h4>
                    <dl className="year-lines">
                      {section.lines.map((line) => (
                        <Fragment key={line.label}>
                          <div className={line.strong ? 'strong' : undefined}>
                            <dt>
                              <LineLabel line={line} details={details} />
                            </dt>
                            <dd className={signClass(line, y)}>{line.value(y)}</dd>
                          </div>
                          {line.details &&
                            details.isOpen(line.details.id) &&
                            line.details.rows.map((row) => (
                              <div key={row.label} className="detail">
                                <dt>
                                  {row.href ? <a href={row.href(y)}>{row.label}</a> : row.label}
                                </dt>
                                <dd>{row.value(y)}</dd>
                              </div>
                            ))}
                        </Fragment>
                      ))}
                    </dl>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Ordre des groupes, comme sur la page Fiscalité : les loyers d'abord, puis par ordre
 * alphabétique, les groupes « Autres… » ensuite ; en dernier, les groupes d'investissements
 * à amortir et de dépenses à qualifier (repérés par le traitement fiscal de leurs catégories).
 */
function sortGroups(categories: readonly Category[], groups: readonly string[]): string[] {
  const special = new Set(
    categories
      .filter((c) => {
        const t = c.taxTreatment['lmnp-reel'];
        return t === 'depreciable' || t === 'to-review';
      })
      .map((c) => c.group),
  );
  const rank = (g: string) =>
    g === RENT_GROUP ? 0 : special.has(g) ? 3 : /^autres?\b/i.test(g) ? 2 : 1;
  return [...groups].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'));
}

/** Clé de l'état ouvert / fermé des détails de la synthèse, dans ce navigateur. */
const OPEN_DETAILS_KEY = 'locapilote.synthese.detailsOuverts';

/** Libellé d'une ligne : un bouton ⊕ / ⊖ quand elle a un détail replié. */
function LineLabel({ line, details }: { line: Line; details: ReturnType<typeof useOpenDetails> }) {
  if (!line.details) return <>{line.label}</>;
  const { id } = line.details;
  const open = details.isOpen(id);
  return (
    <button
      type="button"
      className="disclosure"
      aria-expanded={open}
      onClick={() => details.toggle(id)}
    >
      {line.label}
      <span className="disclosure-sign" aria-hidden="true">
        {open ? '⊖' : '⊕'}
      </span>
    </button>
  );
}
