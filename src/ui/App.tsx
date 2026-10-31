import { outstandingPrincipal } from '../engine/core/loan';
import type { Dataset, Property, TaxRegime } from '../engine/types';
import { loadTestDataset } from '../db/testDataset';
import { formatDate, formatEuros, todayIso } from './format';

const REGIME_LABELS: Record<TaxRegime, string> = {
  'lmnp-reel': 'LMNP au réel',
  'lmnp-micro-bic': 'LMNP micro-BIC',
  'micro-foncier': 'Micro-foncier',
  'reel-foncier': 'Réel foncier',
};

// Jeu de test chargé une fois au démarrage (le stockage IndexedDB arrive avec US01/US03).
const dataset = loadTestDataset();

export function App() {
  const today = todayIso();

  return (
    <div className="page">
      <header className="header">
        <h1>Locapilote</h1>
        <p className="tagline">Piloter un logement en location</p>
      </header>
      <main>
        <p className="notice">Données du jeu de test anonymisé (lecture seule).</p>
        {dataset.properties.map((property) => (
          <PropertyCard key={property.id} property={property} dataset={dataset} today={today} />
        ))}
      </main>
    </div>
  );
}

interface PropertyCardProps {
  property: Property;
  dataset: Dataset;
  today: string;
}

function PropertyCard({ property, dataset, today }: PropertyCardProps) {
  const loans = dataset.loans.filter((l) => l.propertyId === property.id);
  const transactionCount = dataset.transactions.filter((t) => t.propertyId === property.id).length;
  const outstanding = loans.reduce(
    (sum, loan) => sum + outstandingPrincipal(loan, dataset.loanInstallments, today),
    0,
  );

  return (
    <section className="card" aria-labelledby={`bien-${property.id}`}>
      <h2 id={`bien-${property.id}`}>{property.name}</h2>
      <p className="address">
        {property.address}, {property.postalCode ? `${property.postalCode} ` : ''}
        {property.city}
      </p>

      {loans.length > 0 && (
        <div className="highlight">
          <span className="highlight-label">Capital restant dû au {formatDate(today)}</span>
          <span className="highlight-value">{formatEuros(outstanding)}</span>
        </div>
      )}

      <dl className="facts">
        <div>
          <dt>Location</dt>
          <dd>{property.rentalType === 'furnished' ? 'Meublée' : 'Nue'}</dd>
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
          <dt>Coût total d'acquisition</dt>
          <dd>{formatEuros(property.totalAcquisitionCost)}</dd>
        </div>
        <div>
          <dt>Loyer hors charges</dt>
          <dd>{formatEuros(property.rentExcludingCharges)} / mois</dd>
        </div>
        <div>
          <dt>Mouvements saisis</dt>
          <dd>{transactionCount}</dd>
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
