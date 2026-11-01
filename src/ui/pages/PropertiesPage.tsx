import { useState } from 'react';
import { db } from '../../db/database';
import type { Dataset, Property } from '../../engine/types';
import { formatDate, formatEuros } from '../format';
import { REGIME_LABELS, RENTAL_TYPE_LABELS } from '../labels';
import { PropertyForm } from './PropertyForm';

type Editing = { mode: 'new' } | { mode: 'edit'; property: Property } | null;

/**
 * Section « Informations » de Mon bien : la fiche du bien courant, sa modification, et l'ajout
 * d'un autre bien. Sans bien, le formulaire de création s'ouvre directement.
 */
export function PropertyInfoSection({
  data,
  property,
  onCreated,
  message,
  setMessage,
}: {
  data: Dataset;
  property: Property | null;
  onCreated: (id: string) => void;
  /** Message de confirmation, gardé par « Mon bien » : il survit au passage à la fiche créée. */
  message: string | null;
  setMessage: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState<Editing>(property ? null : { mode: 'new' });

  const save = async (saved: Property) => {
    await db.properties.put(saved);
    if (editing?.mode === 'new') onCreated(saved.id);
    setMessage(
      editing?.mode === 'new' ? `Bien « ${saved.name} » créé.` : `Bien « ${saved.name} » modifié.`,
    );
    setEditing(null);
    window.scrollTo(0, 0);
  };

  if (editing || !property) {
    return (
      <PropertyForm
        key={editing?.mode === 'edit' ? editing.property.id : 'new'}
        initial={editing?.mode === 'edit' ? editing.property : null}
        onSave={save}
        onCancel={data.properties.length > 0 ? () => setEditing(null) : null}
      />
    );
  }

  const location = [
    property.address,
    [property.postalCode, property.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  const euros = (cents: number) => (cents > 0 ? formatEuros(cents) : '—');
  const facts: [string, string][] = [
    ['Type de location', RENTAL_TYPE_LABELS[property.rentalType]],
    ['Régime fiscal', REGIME_LABELS[property.taxRegime]],
    ['Acheté le', formatDate(property.acquisitionDate)],
    ['Loué depuis le', property.rentalStartDate ? formatDate(property.rentalStartDate) : '—'],
    ['Surface', property.surfaceM2 ? `${String(property.surfaceM2).replace('.', ',')} m²` : '—'],
    ['Prix d’achat net vendeur', euros(property.purchasePrice)],
    ['Dont mobilier', euros(property.furnitureIncluded)],
    ['Frais d’agence', euros(property.acquisitionAgencyFees)],
    ['Frais de notaire et de garantie', euros(property.notaryAndGuaranteeFees)],
    ['Coût total d’acquisition', formatEuros(property.totalAcquisitionCost)],
    ['Apport', euros(property.downPayment)],
    ['Valeur estimée', euros(property.estimatedValue)],
    [
      'Loyer hors charges',
      property.rentExcludingCharges > 0
        ? `${formatEuros(property.rentExcludingCharges)} / mois`
        : '—',
    ],
    [
      'Provision sur charges',
      property.chargesProvision > 0 ? `${formatEuros(property.chargesProvision)} / mois` : '—',
    ],
    ['Dépôt de garantie', euros(property.securityDeposit)],
    ['Gestionnaire', property.manager || '—'],
    ['Syndic', property.syndic || '—'],
  ];
  if (property.mainResidenceEndDate) {
    facts.push(['Fin de résidence principale', formatDate(property.mainResidenceEndDate)]);
  }

  return (
    <div className="stack">
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <section className="card stack" aria-label="Informations du bien">
        <div className="toolbar">
          <div>
            <h3>Informations</h3>
            {location && <p className="address">{location}</p>}
          </div>
          <button
            type="button"
            className="button"
            onClick={() => {
              setMessage(null);
              setEditing({ mode: 'edit', property });
            }}
          >
            Modifier
          </button>
        </div>
        <dl className="facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            setMessage(null);
            setEditing({ mode: 'new' });
          }}
        >
          Ajouter un bien
        </button>
        {data.properties.length > 1 && (
          <span className="muted small">
            {data.properties.length} biens : choisis celui à afficher avec « Bien courant », en haut
            de l’écran.
          </span>
        )}
      </div>
    </div>
  );
}
