import { useState } from 'react';
import { db } from '../../db/database';
import type { Dataset, Property } from '../../engine/types';
import { formatDate, formatEuros } from '../format';
import { REGIME_LABELS, RENTAL_TYPE_LABELS } from '../labels';
import { PropertyForm } from './PropertyForm';

type Editing = { mode: 'new' } | { mode: 'edit'; property: Property } | null;

export function PropertiesPage({
  data,
  onCreated,
}: {
  data: Dataset;
  onCreated: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Editing>(
    data.properties.length === 0 ? { mode: 'new' } : null,
  );
  const [message, setMessage] = useState<string | null>(null);

  const save = async (property: Property) => {
    await db.properties.put(property);
    if (editing?.mode === 'new') onCreated(property.id);
    setMessage(
      editing?.mode === 'new'
        ? `Bien « ${property.name} » créé.`
        : `Bien « ${property.name} » modifié.`,
    );
    setEditing(null);
    window.scrollTo(0, 0);
  };

  if (editing) {
    return (
      <PropertyForm
        key={editing.mode === 'edit' ? editing.property.id : 'new'}
        initial={editing.mode === 'edit' ? editing.property : null}
        onSave={save}
        onCancel={data.properties.length > 0 ? () => setEditing(null) : null}
      />
    );
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <h2>Mes biens</h2>
        <button
          type="button"
          className="button primary"
          onClick={() => {
            setMessage(null);
            setEditing({ mode: 'new' });
          }}
        >
          Ajouter un bien
        </button>
      </div>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {data.properties.map((p) => (
        <section key={p.id} className="card property-row">
          <div>
            <h3>{p.name}</h3>
            <p className="muted small">
              {RENTAL_TYPE_LABELS[p.rentalType]} · {REGIME_LABELS[p.taxRegime]} · acheté le{' '}
              {formatDate(p.acquisitionDate)} · {formatEuros(p.totalAcquisitionCost)}
            </p>
          </div>
          <button
            type="button"
            className="button"
            onClick={() => {
              setMessage(null);
              setEditing({ mode: 'edit', property: p });
            }}
          >
            Modifier
          </button>
        </section>
      ))}
    </div>
  );
}
