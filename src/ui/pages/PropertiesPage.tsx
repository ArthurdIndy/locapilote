import { useState } from 'react';
import { db } from '../../db/database';
import type { Dataset, Property } from '../../engine/types';
import { Modal } from '../components/Modal';
import { downloadBackup } from '../dataActions';
import { describePropertyDeletion, propertyFootprint } from '../dataSummary';
import { routeHref } from '../router';
import { formatDate, formatEuros } from '../format';
import { REGIME_LABELS, RENTAL_TYPE_LABELS } from '../labels';
import { PropertyForm } from './PropertyForm';

/**
 * Section « Informations » de Mon bien : la fiche du bien courant et sa modification. L'ajout
 * d'un bien est géré par « Mon bien » (bouton à droite du titre).
 */
export function PropertyInfoSection({
  data,
  today,
  onDeleted,
  property,
  message,
  setMessage,
}: {
  data: Dataset;
  today: string;
  /** Après la suppression : le bien courant passe à un autre bien, ou à aucun. */
  onDeleted: (id: string) => void;
  property: Property;
  /** Message de confirmation, gardé par « Mon bien » : il survit au passage à la fiche créée. */
  message: string | null;
  setMessage: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async (saved: Property) => {
    await db.properties.put(saved);
    setMessage(`Bien « ${saved.name} » modifié.`);
    setEditing(false);
    window.scrollTo(0, 0);
  };

  if (editing) {
    return (
      <PropertyForm
        key={property.id}
        initial={property}
        onSave={save}
        onCancel={() => setEditing(false)}
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
    ['Frais d’acquisition réels (plus-value)', euros(property.actualAcquisitionCosts ?? 0)],
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
          <div className="actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                setMessage(null);
                setEditing(true);
              }}
            >
              Modifier
            </button>
            <button
              type="button"
              className="button danger-outline"
              onClick={() => {
                setMessage(null);
                setDeleting(true);
              }}
            >
              Supprimer ce bien
            </button>
          </div>
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
      {deleting && (
        <DeletePropertyDialog
          data={data}
          today={today}
          property={property}
          onCancel={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

/**
 * Confirmation de la suppression d'un bien : ce qui sera supprimé (compteurs réels), un lien
 * pour exporter d'abord, et le nom du bien à retaper pour activer le bouton.
 */
function DeletePropertyDialog({
  data,
  today,
  property,
  onCancel,
  onDeleted,
}: {
  data: Dataset;
  today: string;
  property: Property;
  onCancel: () => void;
  onDeleted: (id: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim() === property.name;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await db.deleteProperty(property.id);
      onDeleted(property.id);
      window.location.hash = routeHref('accueil');
    } catch (e) {
      setError(`Suppression impossible : ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Supprimer « ${property.name} » ?`} onClose={onCancel}>
      <p>{describePropertyDeletion(propertyFootprint(data, property.id))}</p>
      <p>
        <button type="button" className="button link" onClick={() => void downloadBackup(today)}>
          Exporter mes données d’abord
        </button>
      </p>
      <label className="field">
        <span>Tape le nom du bien pour confirmer</span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="actions">
        <button type="button" className="button" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="button danger-solid"
          disabled={!confirmed || busy}
          onClick={remove}
        >
          Supprimer définitivement
        </button>
      </div>
    </Modal>
  );
}
