import { useState } from 'react';
import { db } from '../../db/database';
import { isValidIsoDate } from '../../engine/dates';
import type { IsoDate } from '../../engine/types';

interface Props {
  propertyId: string;
  date: IsoDate;
  isDefault: boolean;
}

/**
 * « Données à jour au » : une ligne compacte en haut de la Synthèse et de la Fiscalité.
 * La date est enregistrée par bien : les deux pages affichent la même.
 */
export function DataAsOfBar({ propertyId, date, isDefault }: Props) {
  const [error, setError] = useState<string | null>(null);

  const change = async (value: string) => {
    if (!isValidIsoDate(value)) {
      setError('Date invalide.');
      return;
    }
    setError(null);
    await db.setDataAsOf(propertyId, value);
  };

  return (
    <section className="data-as-of-bar" aria-label="Date de mise à jour des données">
      <label className="data-as-of">
        <span>Données à jour au</span>
        <input type="date" value={date} onChange={(e) => change(e.target.value)} />
      </label>
      <span className="muted small">
        {isDefault ? 'Par défaut, la date du jour. ' : ''}
        Années suivantes masquées, échéances de prêt comptées jusqu’à cette date.
      </span>
      {error && <span className="error-text">{error}</span>}
    </section>
  );
}
