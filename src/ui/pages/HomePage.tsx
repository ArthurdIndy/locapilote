import { outstandingPrincipal } from '../../engine/core/loan';
import type { Dataset, Property } from '../../engine/types';
import { formatDate, formatEuros } from '../format';
import { REGIME_LABELS, RENTAL_TYPE_LABELS } from '../labels';
import { propertyHref, routeHref } from '../router';

export function HomePage({ data, today }: { data: Dataset; today: string }) {
  if (data.properties.length === 0) {
    return (
      <section className="card">
        <h2>Aucun bien pour l’instant</h2>
        <p>Commence par créer le logement que tu loues.</p>
        <a className="button primary" href={propertyHref('informations')}>
          Créer mon bien
        </a>
      </section>
    );
  }
  return (
    <div className="stack">
      {data.properties.map((property) => (
        <PropertyCard key={property.id} property={property} data={data} today={today} />
      ))}
    </div>
  );
}

function PropertyCard({
  property,
  data,
  today,
}: {
  property: Property;
  data: Dataset;
  today: string;
}) {
  const loans = data.loans.filter((l) => l.propertyId === property.id);
  const transactionCount = data.transactions.filter((t) => t.propertyId === property.id).length;
  const outstanding = loans.reduce(
    (sum, loan) => sum + outstandingPrincipal(loan, data.loanInstallments, today),
    0,
  );
  const location = [
    property.address,
    [property.postalCode, property.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section className="card" aria-labelledby={`bien-${property.id}`}>
      <h2 id={`bien-${property.id}`}>{property.name}</h2>
      {location && <p className="address">{location}</p>}

      {loans.length > 0 && (
        <div className="highlight">
          <span className="highlight-label">Capital restant dû au {formatDate(today)}</span>
          <span className="highlight-value">{formatEuros(outstanding)}</span>
        </div>
      )}

      <dl className="facts">
        <div>
          <dt>Location</dt>
          <dd>{RENTAL_TYPE_LABELS[property.rentalType]}</dd>
        </div>
        <div>
          <dt>Régime fiscal</dt>
          <dd>{REGIME_LABELS[property.taxRegime]}</dd>
        </div>
        <div>
          <dt>Acheté le</dt>
          <dd>{formatDate(property.acquisitionDate)}</dd>
        </div>
        <div>
          <dt>Loué depuis le</dt>
          <dd>{property.rentalStartDate ? formatDate(property.rentalStartDate) : '—'}</dd>
        </div>
        <div>
          <dt>Coût total d’acquisition</dt>
          <dd>{formatEuros(property.totalAcquisitionCost)}</dd>
        </div>
        <div>
          <dt>Loyer hors charges</dt>
          <dd>
            {property.rentExcludingCharges > 0
              ? `${formatEuros(property.rentExcludingCharges)} / mois`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Mouvements saisis</dt>
          <dd>
            <a href={routeHref('mouvements')}>{transactionCount}</a>
          </dd>
        </div>
        {loans.map((loan) => (
          <div key={loan.id}>
            <dt>Prêt</dt>
            <dd>
              {formatEuros(loan.principal)} sur {loan.durationMonths / 12} ans
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
