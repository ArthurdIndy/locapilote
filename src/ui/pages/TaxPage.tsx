import { effectiveDataAsOf } from '../../db/defaultAssumptions';
import type { Dataset, Property } from '../../engine/types';
import { propertyHref } from '../router';
import { DataAsOfBar } from './DataAsOfBar';
import { TaxSection } from './TaxSection';
import { PropertyTitle } from '../components/PropertyTitle';

interface Props {
  data: Dataset;
  property: Property | null;
  today: string;
}

/**
 * Page Fiscalité : récapitulatif du régime du bien, rapprochement avec le comptable, export.
 * Même date de mise à jour des données que la Synthèse.
 */
export function TaxPage({ data, property, today }: Props) {
  if (!property) {
    return (
      <section className="card">
        <h2>Fiscalité</h2>
        <p>Crée d’abord un bien.</p>
        <a className="button primary" href={propertyHref('informations')}>
          Créer un bien
        </a>
      </section>
    );
  }

  const asOf = effectiveDataAsOf(data.assumptions, property.id, today);

  return (
    <div className="stack">
      <PropertyTitle title="Fiscalité" />
      <DataAsOfBar propertyId={property.id} date={asOf.date} isDefault={asOf.isDefault} />
      {property.taxRegime === 'lmnp-reel' && !property.rentalStartDate ? (
        <p className="card">
          Indique la date de mise en location du bien (
          <a href={propertyHref('informations')}>Mon bien</a>) pour voir son résultat fiscal.
        </p>
      ) : (
        <TaxSection data={data} property={property} dataAsOf={asOf.date} />
      )}
    </div>
  );
}
