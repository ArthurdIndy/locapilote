import type { Dataset } from '../../engine/types';
import { DataPage } from './DataPage';

/**
 * ⚙ Paramètres : pour l'instant les données (export, import, jeu de test) ; plus tard les
 * catégories et les paramètres du foyer.
 */
export function SettingsPage({ data, today }: { data: Dataset; today: string }) {
  return (
    <div className="stack">
      <h2>Paramètres</h2>
      <p className="muted small">
        Données : sauvegarde, import, export pour Excel et jeu de test. Les catégories et les
        paramètres du foyer viendront ici.
      </p>
      <DataPage data={data} today={today} />
    </div>
  );
}
