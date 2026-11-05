import type { Property } from '../../engine/types';
import { PropertyTitle } from '../components/PropertyTitle';
import { propertyHref } from '../router';

/** Budget : l'année en cours du bien courant (US12, rempli à l'itération 4c). */
export function BudgetPage({ property }: { property: Property | null }) {
  if (!property) {
    return (
      <section className="card">
        <h2>Budget</h2>
        <p>Crée d’abord un bien.</p>
        <a className="button primary" href={propertyHref('informations')}>
          Créer un bien
        </a>
      </section>
    );
  }
  return (
    <div className="stack">
      <PropertyTitle title="Budget" />
      <p className="card">Budget de l’année : prévu, réalisé et écarts. Prochainement.</p>
    </div>
  );
}
