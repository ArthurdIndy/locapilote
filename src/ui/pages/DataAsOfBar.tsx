import { useState, type KeyboardEvent } from 'react';
import { db } from '../../db/database';
import type { IsoDate } from '../../engine/types';
import { formatDate, isPlausibleDate, PLAUSIBLE_YEARS } from '../format';

interface Props {
  propertyId: string;
  date: IsoDate;
  isDefault: boolean;
}

/**
 * « Données à jour au » : une ligne compacte en haut de la Synthèse et de la Fiscalité.
 * La date est enregistrée par bien : les deux pages affichent la même.
 *
 * Le champ garde sa propre saisie en cours : pendant la frappe, le navigateur produit des dates
 * intermédiaires (taper « 2 » dans l'année donne 0002). Seule une date complète et plausible
 * est enregistrée, aussitôt ou en quittant le champ (perte du focus, touche Entrée) ; sinon la
 * date précédente reste en vigueur.
 */
export function DataAsOfBar({ propertyId, date, isDefault }: Props) {
  const [draft, setDraft] = useState(date);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Date enregistrée changée ailleurs (autre page, autre bien) : on la reprend hors saisie.
  const [savedDate, setSavedDate] = useState(date);
  if (date !== savedDate) {
    setSavedDate(date);
    if (!editing) setDraft(date);
  }

  const save = async (value: string) => {
    if (value !== date) await db.setDataAsOf(propertyId, value);
  };

  const change = (value: string) => {
    setDraft(value);
    setError(null);
    if (isPlausibleDate(value)) void save(value);
  };

  const leave = () => {
    setEditing(false);
    if (isPlausibleDate(draft)) {
      void save(draft);
      return;
    }
    if (draft !== date) {
      setError(
        `Date incomplète ou hors de la plage ${PLAUSIBLE_YEARS.min}-${PLAUSIBLE_YEARS.max} : la date du ${formatDate(date)} est conservée.`,
      );
    }
    setDraft(date);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      leave();
    }
  };

  return (
    <section className="data-as-of-bar" aria-label="Date de mise à jour des données">
      <label className="data-as-of">
        <span>Données à jour au</span>
        <input
          type="date"
          value={draft}
          min={`${PLAUSIBLE_YEARS.min}-01-01`}
          max={`${PLAUSIBLE_YEARS.max}-12-31`}
          onFocus={() => setEditing(true)}
          onChange={(e) => change(e.target.value)}
          onBlur={leave}
          onKeyDown={onKeyDown}
        />
      </label>
      <span className="muted small">
        {isDefault ? 'Par défaut, la date du jour. ' : ''}
        Années suivantes masquées, échéances de prêt comptées jusqu’à cette date.
      </span>
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </section>
  );
}
