import { useEffect, useState } from 'react';
import type { Dataset, Property } from '../../engine/types';
import { goBack, PROPERTY_SECTIONS, propertyHref, type PropertySectionId } from '../router';
import { AssetsPage } from './AssetsPage';
import { LoansPage } from './LoansPage';
import { PropertyInfoSection } from './PropertiesPage';
import { PropertyForm } from './PropertyForm';
import { db } from '../../db/database';
import { PropertyTitle } from '../components/PropertyTitle';

interface Props {
  data: Dataset;
  property: Property | null;
  today: string;
  params: URLSearchParams;
  onCreated: (id: string) => void;
  onDeleted: (id: string) => void;
}

/**
 * « Mon bien » : la fiche du bien courant, en trois sections (onglets) : informations, prêt,
 * immobilisations. La section est dans l'adresse (#/mon-bien?section=pret).
 */
export function MyPropertyPage({ data, property, today, params, onCreated, onDeleted }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  // Ajout d'un bien : bouton à droite du titre, ou carte « + Ajouter un bien » de l'Accueil
  // (#/mon-bien?nouveau=1). Sans bien, le formulaire s'ouvre directement.
  const [adding, setAdding] = useState(() => params.get('nouveau') === '1');
  const requested = params.get('section');
  const section: PropertySectionId =
    PROPERTY_SECTIONS.find((s) => s.id === requested)?.id ?? 'informations';

  // Bien tout juste créé, en attendant qu'il arrive dans les données affichées.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const create = async (created: Property) => {
    await db.createProperty(created);
    onCreated(created.id);
    setMessage(`Bien « ${created.name} » créé.`);
    setCreatedId(created.id);
  };

  // La fiche du bien créé s'ouvre sur ses informations, une fois le bien relu dans la base :
  // sans bien, les pages d'un bien ramènent à l'Accueil.
  const justCreated = createdId !== null && data.properties.some((p) => p.id === createdId);
  useEffect(() => {
    if (!justCreated) return;
    window.location.hash = propertyHref('informations');
    window.scrollTo(0, 0);
  }, [justCreated]);

  if ((adding && !justCreated) || !property) {
    return (
      <PropertyForm
        key="new"
        initial={null}
        onSave={create}
        onCancel={property ? () => setAdding(false) : goBack}
      />
    );
  }

  return (
    <div className="stack">
      <div className="toolbar title-toolbar">
        <PropertyTitle title="Mon bien" />
        <button
          type="button"
          className="button"
          onClick={() => {
            setMessage(null);
            setCreatedId(null);
            setAdding(true);
            window.scrollTo(0, 0);
          }}
        >
          Ajouter un bien
        </button>
      </div>
      <nav className="tabs" aria-label="Sections du bien">
        {PROPERTY_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={propertyHref(s.id)}
            aria-current={s.id === section ? 'page' : undefined}
          >
            {s.label}
          </a>
        ))}
      </nav>
      {section === 'informations' && (
        <PropertyInfoSection
          key={property.id}
          data={data}
          today={today}
          onDeleted={onDeleted}
          property={property}
          message={message}
          setMessage={setMessage}
        />
      )}
      {section === 'pret' && (
        <LoansPage key={property.id} data={data} property={property} today={today} />
      )}
      {section === 'immobilisations' && (
        <AssetsPage key={property.id} data={data} property={property} today={today} />
      )}
    </div>
  );
}
