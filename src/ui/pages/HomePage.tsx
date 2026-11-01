import type { Dataset } from '../../engine/types';
import { REGIME_LABELS, RENTAL_TYPE_LABELS } from '../labels';
import { propertyHref, routeHref } from '../router';

/**
 * Accueil : la seule page qui montre tous les biens. Une carte par bien ; un clic en fait le
 * bien courant et ouvre sa Synthèse. Le tableau de bord (US21) ajoutera ses indicateurs dans
 * chaque carte.
 */
export function HomePage({ data, onOpen }: { data: Dataset; onOpen: (id: string) => void }) {
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
      <h2>Mes biens</h2>
      <ul className="property-cards">
        {data.properties.map((property) => {
          const location = [
            property.address,
            [property.postalCode, property.city].filter(Boolean).join(' '),
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <li key={property.id}>
              <a
                className="card property-card"
                href={routeHref('synthese')}
                onClick={() => onOpen(property.id)}
              >
                <h3>{property.name}</h3>
                {location && <span className="address">{location}</span>}
                <span className="property-card-facts">
                  {RENTAL_TYPE_LABELS[property.rentalType]} · {REGIME_LABELS[property.taxRegime]}
                </span>
                <span className="property-card-action">Voir la synthèse →</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
