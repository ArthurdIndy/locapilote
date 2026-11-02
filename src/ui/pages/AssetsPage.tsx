import { useState, type FormEvent } from 'react';
import { db } from '../../db/database';
import { effectiveDataAsOf } from '../../db/defaultAssumptions';
import { isValidIsoDate, yearOf } from '../../engine/dates';
import {
  annualDepreciation,
  assetDepreciation,
  depreciationEndDate,
  yearDepreciation,
} from '../../engine/tax/lmnp-reel';
import type { Asset, Dataset, Property } from '../../engine/types';
import {
  centsToInput,
  formatDate,
  formatDecimal,
  formatEuros,
  parseEurosInput,
  parseYearsInput,
} from '../format';
import { propertyHref, routeHref } from '../router';
import { TaxDisclaimer } from './TaxDisclaimer';

interface Props {
  data: Dataset;
  property: Property | null;
  today: string;
}

type Editing = { mode: 'new' } | { mode: 'edit'; asset: Asset } | null;

const euros = (cents: number) => formatEuros(Math.round(cents));

function durationLabel(years: number): string {
  if (years <= 0) return 'Non amorti';
  return `${formatDecimal(years)} an${years >= 2 ? 's' : ''}`;
}

/** Années affichées : de la première mise en service amortie (ou de la mise en location) à la date des données. */
function displayedYears(assets: readonly Asset[], property: Property, asOf: string): number[] {
  const starts = assets.filter((a) => a.durationYears > 0).map((a) => yearOf(a.inServiceDate));
  if (property.rentalStartDate) starts.push(yearOf(property.rentalStartDate));
  if (starts.length === 0) return [];
  const years: number[] = [];
  for (let y = Math.min(...starts); y <= yearOf(asOf); y++) years.push(y);
  return years;
}

export function AssetsPage({ data, property, today }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!property) {
    return (
      <section className="card">
        <h2>Immobilisations</h2>
        <p>Crée d’abord un bien : chaque immobilisation y est rattachée.</p>
        <a className="button primary" href={propertyHref('informations')}>
          Créer un bien
        </a>
      </section>
    );
  }

  const asOf = effectiveDataAsOf(data.assumptions, property.id, today).date;
  const assets = data.assets
    .filter((a) => a.propertyId === property.id)
    .sort(
      (a, b) =>
        a.inServiceDate.localeCompare(b.inServiceDate) || a.component.localeCompare(b.component),
    );
  const years = displayedYears(assets, property, asOf);

  const remove = async (asset: Asset) => {
    const ok = window.confirm(
      `Supprimer l’immobilisation « ${asset.component} » (${formatEuros(asset.value)}) ?\n\nSes dotations disparaîtront du résultat fiscal. Cette action est définitive.`,
    );
    if (!ok) return;
    await db.deleteAsset(asset.id);
    if (editing?.mode === 'edit' && editing.asset.id === asset.id) setEditing(null);
    setMessage(`Immobilisation « ${asset.component} » supprimée.`);
  };

  const startEdit = (next: Editing) => {
    setMessage(null);
    setEditing(next);
    window.scrollTo(0, 0);
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <h3>Immobilisations</h3>
        {!editing && (
          <button
            type="button"
            className="button primary"
            onClick={() => startEdit({ mode: 'new' })}
          >
            Nouvelle immobilisation
          </button>
        )}
      </div>

      <p className="muted small">
        Une ligne par composant : terrain, bâtiment, mobilier, gros équipement, travaux… Tu choisis
        toi-même la valeur et la durée de chacun (en général celles retenues par ton comptable) ;
        Locapilote n’impose aucune clé de répartition. Durée 0 = non amorti (terrain, ou élément que
        le comptable n’amortit pas). Dotation linéaire au prorata des jours, base 365.
      </p>

      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}

      {editing && (
        <AssetForm
          key={editing.mode === 'edit' ? editing.asset.id : 'new'}
          propertyId={property.id}
          initial={editing.mode === 'edit' ? editing.asset : null}
          onCancel={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMessage(text);
          }}
        />
      )}

      {assets.length === 0 ? (
        <p className="card muted">
          Aucune immobilisation pour l’instant. Clique sur « Nouvelle immobilisation ».
        </p>
      ) : (
        <>
          <div className="synthesis-wide stack">
            <table className="synthesis-table assets-table" aria-label="Liste des immobilisations">
              <thead>
                <tr>
                  <th scope="col">Composant</th>
                  <th scope="col">Mise en service</th>
                  <th scope="col">Valeur</th>
                  <th scope="col">Durée</th>
                  <th scope="col">Dotation / an</th>
                  <th scope="col">Fin d’amortissement</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const end = depreciationEndDate(a);
                  return (
                    <tr key={a.id}>
                      <th scope="row">
                        {a.component}
                        <span className="tx-actions">
                          <button
                            type="button"
                            className="button small"
                            aria-label={`Modifier ${a.component}`}
                            onClick={() => startEdit({ mode: 'edit', asset: a })}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="button small danger"
                            aria-label={`Supprimer ${a.component}`}
                            onClick={() => remove(a)}
                          >
                            Supprimer
                          </button>
                        </span>
                      </th>
                      <td>{formatDate(a.inServiceDate)}</td>
                      <td>{formatEuros(a.value)}</td>
                      <td>{durationLabel(a.durationYears)}</td>
                      <td>{euros(annualDepreciation(a))}</td>
                      <td>{end ? formatDate(end) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {years.length > 0 && (
              <table className="synthesis-table assets-table" aria-label="Dotations par année">
                <thead>
                  <tr>
                    <th scope="col">Dotation de l’année</th>
                    {years.map((y) => (
                      <th key={y} scope="col">
                        {y}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assets
                    .filter((a) => a.durationYears > 0)
                    .map((a) => (
                      <tr key={a.id}>
                        <th scope="row">{a.component}</th>
                        {years.map((y) => (
                          <td key={y}>{euros(assetDepreciation(a, y))}</td>
                        ))}
                      </tr>
                    ))}
                  <tr className="strong">
                    <th scope="row">Total</th>
                    {years.map((y) => (
                      <td key={y}>{formatEuros(yearDepreciation(assets, y))}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          <div className="synthesis-narrow stack">
            {years.length > 0 && (
              <section className="card year-card" aria-label="Dotations par année">
                <h3>Dotations de l’année</h3>
                <dl className="year-lines">
                  {[...years].reverse().map((y) => (
                    <div key={y} className="strong">
                      <dt>{y}</dt>
                      <dd>{formatEuros(yearDepreciation(assets, y))}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {assets.map((a) => {
              const end = depreciationEndDate(a);
              return (
                <section key={a.id} className="card year-card" aria-label={a.component}>
                  <h3>{a.component}</h3>
                  <dl className="year-lines">
                    <div>
                      <dt>Mise en service</dt>
                      <dd>{formatDate(a.inServiceDate)}</dd>
                    </div>
                    <div>
                      <dt>Valeur</dt>
                      <dd>{formatEuros(a.value)}</dd>
                    </div>
                    <div>
                      <dt>Durée</dt>
                      <dd>{durationLabel(a.durationYears)}</dd>
                    </div>
                    {end && (
                      <>
                        <div>
                          <dt>Dotation annuelle</dt>
                          <dd>{euros(annualDepreciation(a))}</dd>
                        </div>
                        <div>
                          <dt>Fin d’amortissement</dt>
                          <dd>{formatDate(end)}</dd>
                        </div>
                        {[...years].reverse().map((y) => (
                          <div key={y} className="detail">
                            <dt>Dotation {y}</dt>
                            <dd>{euros(assetDepreciation(a, y))}</dd>
                          </div>
                        ))}
                      </>
                    )}
                  </dl>
                  <div className="actions">
                    <button
                      type="button"
                      className="button small"
                      aria-label={`Modifier ${a.component}`}
                      onClick={() => startEdit({ mode: 'edit', asset: a })}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="button small danger"
                      aria-label={`Supprimer ${a.component}`}
                      onClick={() => remove(a)}
                    >
                      Supprimer
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
          <p className="muted small">
            Le total de l’année est arrondi au centime ; chaque ligne est affichée arrondie. Les
            dotations alimentent le résultat fiscal de la page{' '}
            <a href={routeHref('fiscalite')}>Fiscalité</a>.
          </p>
        </>
      )}

      <TaxDisclaimer />
    </div>
  );
}

interface FormProps {
  propertyId: string;
  initial: Asset | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
}

function AssetForm({ propertyId, initial, onCancel, onSaved }: FormProps) {
  const [component, setComponent] = useState(initial?.component ?? '');
  const [inServiceDate, setInServiceDate] = useState(initial?.inServiceDate ?? '');
  const [value, setValue] = useState(initial ? centsToInput(initial.value) : '');
  const [duration, setDuration] = useState(
    initial ? String(initial.durationYears).replace('.', ',') : '',
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cents = parseEurosInput(value);
    const years = parseYearsInput(duration);
    const problems: string[] = [];
    if (!component.trim()) problems.push('Indique le composant (ex. « Bâtiment »).');
    if (!isValidIsoDate(inServiceDate)) problems.push('Indique la date de mise en service.');
    if (cents === null || cents < 0) problems.push('La valeur doit être un montant positif.');
    if (years === null) problems.push('La durée doit être un nombre d’années (0 = non amorti).');
    setErrors(problems);
    if (problems.length > 0 || cents === null || years === null) return;

    const asset: Asset = {
      id: initial?.id ?? crypto.randomUUID(),
      propertyId,
      component: component.trim(),
      inServiceDate,
      value: cents,
      durationYears: years,
    };
    setSaving(true);
    try {
      await db.saveAsset(asset);
      onSaved(
        initial
          ? `Immobilisation « ${asset.component} » modifiée.`
          : `Immobilisation « ${asset.component} » ajoutée.`,
      );
    } catch (e) {
      setErrors([`Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}`]);
      setSaving(false);
    }
  };

  const years = parseYearsInput(duration);
  const cents = parseEurosInput(value);

  return (
    <form className="card form" onSubmit={submit} noValidate aria-label="Immobilisation">
      <h2>{initial ? 'Modifier l’immobilisation' : 'Nouvelle immobilisation'}</h2>
      <div className="row">
        <label className="field">
          <span>Composant *</span>
          <input
            value={component}
            placeholder="Bâtiment, mobilier, cuisine…"
            onChange={(e) => setComponent(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Date de mise en service *</span>
          <input
            type="date"
            value={inServiceDate}
            onChange={(e) => setInServiceDate(e.target.value)}
          />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Valeur (€) *</span>
          <input
            className="amount"
            inputMode="decimal"
            placeholder="0,00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Durée (années) *</span>
          <input
            className="amount"
            inputMode="decimal"
            placeholder="0 = non amorti"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
          <span className="muted small" aria-live="polite">
            {years === null
              ? '0 = non amorti'
              : years === 0
                ? 'Non amorti'
                : cents !== null
                  ? `Dotation annuelle : ${euros(cents / years)}`
                  : ''}
          </span>
        </label>
      </div>
      {errors.length > 0 && (
        <ul className="error-text" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="actions">
        <button type="submit" className="button primary" disabled={saving}>
          {initial ? 'Enregistrer' : 'Ajouter l’immobilisation'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
