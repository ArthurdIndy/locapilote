import { useState } from 'react';
import type { Dataset, Property } from '../../engine/types';
import { PROPERTY_SECTIONS, propertyHref, type PropertySectionId } from '../router';
import { AssetsPage } from './AssetsPage';
import { LoansPage } from './LoansPage';
import { PropertyInfoSection } from './PropertiesPage';
import { PropertyTitle } from '../components/PropertyTitle';

interface Props {
  data: Dataset;
  property: Property | null;
  today: string;
  params: URLSearchParams;
  onCreated: (id: string) => void;
}

/**
 * « Mon bien » : la fiche du bien courant, en trois sections (onglets) : informations, prêt,
 * immobilisations. La section est dans l'adresse (#/mon-bien?section=pret).
 */
export function MyPropertyPage({ data, property, today, params, onCreated }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const requested = params.get('section');
  const section: PropertySectionId =
    PROPERTY_SECTIONS.find((s) => s.id === requested)?.id ?? 'informations';

  if (!property) {
    return (
      <PropertyInfoSection
        data={data}
        property={null}
        onCreated={onCreated}
        message={message}
        setMessage={setMessage}
      />
    );
  }

  return (
    <div className="stack">
      <PropertyTitle title="Mon bien" />
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
          property={property}
          onCreated={onCreated}
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
