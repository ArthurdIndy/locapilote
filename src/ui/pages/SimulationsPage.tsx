import type { Dataset, Property } from '../../engine/types';
import { PropertyTitle } from '../components/PropertyTitle';
import { propertyHref } from '../router';
import { SalePage } from './SalePage';

interface Props {
  data: Dataset;
  property: Property | null;
  today: string;
}

/** Simulations : le futur du bien courant. Vente (US11) ; le budget (US12) arrive ensuite. */
export function SimulationsPage({ data, property, today }: Props) {
  if (!property) {
    return (
      <section className="card">
        <h2>Simulations</h2>
        <p>Crée d’abord un bien.</p>
        <a className="button primary" href={propertyHref('informations')}>
          Créer un bien
        </a>
      </section>
    );
  }
  return (
    <div className="stack">
      <PropertyTitle title="Simulations" />
      <SalePage data={data} property={property} today={today} />
      <p className="muted small">Budget prévisionnel : prochainement, dans cette même page.</p>
    </div>
  );
}
