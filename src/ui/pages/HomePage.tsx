import { useState } from 'react';
import type { Dataset } from '../../engine/types';
import { backupReminderText, currentBackupReminder } from '../backupReminder';
import { downloadBackup } from '../dataActions';
import { REGIME_LABELS, RENTAL_TYPE_LABELS } from '../labels';
import { propertyHref, routeHref } from '../router';
import { WelcomePage } from './WelcomePage';

/**
 * Accueil : la seule page qui montre tous les biens. Une carte par bien ; un clic en fait le
 * bien courant et ouvre sa Synthèse. Sans aucun bien : l'écran de bienvenue. Au-dessus des
 * cartes, le rappel de sauvegarde quand il le faut.
 */
export function HomePage({
  data,
  today,
  onOpen,
}: {
  data: Dataset;
  today: string;
  onOpen: (id: string) => void;
}) {
  if (data.properties.length === 0) return <WelcomePage today={today} />;
  return <PropertyList data={data} today={today} onOpen={onOpen} />;
}

function BackupReminderBanner({ today }: { today: string }) {
  const [reminder, setReminder] = useState(() => currentBackupReminder(today));
  if (!reminder) return null;
  return (
    <div className="backup-reminder" role="status" aria-label="Rappel de sauvegarde">
      <p>{backupReminderText(reminder)}</p>
      <button
        type="button"
        className="button reminder"
        onClick={async () => {
          await downloadBackup(today);
          setReminder(currentBackupReminder(today));
        }}
      >
        Exporter
      </button>
    </div>
  );
}

function PropertyList({
  data,
  today,
  onOpen,
}: {
  data: Dataset;
  today: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="stack">
      <BackupReminderBanner today={today} />
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
              {/* Toute la carte est cliquable : le lien « Voir la synthèse › » la couvre. */}
              <section className="card property-card" aria-label={property.name}>
                <h3>{property.name}</h3>
                {location && <span className="address">{location}</span>}
                <span className="property-card-facts">
                  {RENTAL_TYPE_LABELS[property.rentalType]} · {REGIME_LABELS[property.taxRegime]}
                </span>
                <a
                  className="property-card-action"
                  href={routeHref('synthese')}
                  onClick={() => onOpen(property.id)}
                >
                  Voir la synthèse
                  <span className="visually-hidden"> de {property.name}</span> ›
                </a>
              </section>
            </li>
          );
        })}
        <li>
          <a
            className="card property-card add-property-card"
            href={propertyHref('informations', true)}
          >
            + Ajouter un bien
          </a>
        </li>
      </ul>
    </div>
  );
}
