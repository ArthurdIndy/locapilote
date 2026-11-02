import type { Dataset } from '../../engine/types';
import { DataPage } from './DataPage';
import { ReferenceInvestmentForm } from './ReferenceInvestmentForm';

/**
 * ⚙ Paramètres : les paramètres du foyer (placement de référence), puis les données (export,
 * import, jeu de test) ; plus tard les catégories.
 */
export function SettingsPage({ data, today }: { data: Dataset; today: string }) {
  return (
    <div className="stack">
      <h2>Paramètres</h2>
      <ReferenceInvestmentForm data={data} />
      <p className="muted small">
        Données : sauvegarde, import, export pour Excel et jeu de test. Les catégories viendront
        ici.
      </p>
      <DataPage data={data} today={today} />
    </div>
  );
}
