import { useState } from 'react';
import { loadExample } from '../dataActions';
import { propertyHref } from '../router';

/**
 * Écran de bienvenue : l'Accueil quand il n'y a aucun bien (navigateur vide, ou dernier bien
 * supprimé). Deux choix : créer son bien, ou découvrir l'outil avec l'exemple (sans
 * confirmation : il n'y a pas de données à perdre).
 */
export function WelcomePage({ today }: { today: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discover = async () => {
    setBusy(true);
    setError(null);
    try {
      await loadExample(today);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <section className="card welcome" aria-labelledby="bienvenue">
      <h2 id="bienvenue">Bienvenue sur Locapilote</h2>
      <p>Suis les loyers, les dépenses, la fiscalité et la vente de ton logement en location.</p>
      <div className="actions welcome-actions">
        <a className="button primary" href={propertyHref('informations', true)}>
          Créer mon bien
        </a>
        <button type="button" className="button" disabled={busy} onClick={discover}>
          Découvrir avec un exemple
        </button>
      </div>
      {error && <p className="error-text">Erreur : {error}</p>}
      <div className="welcome-notes muted small">
        <p>
          L’exemple est un appartement fictif. Pour repartir de zéro ensuite, supprime-le dans Mon
          bien.
        </p>
        <p>
          Tes données restent dans ce navigateur. Pense à les exporter (
          <span className="desktop-only">⚙ Paramètres</span>
          <span className="phone-only-inline">☰ › Paramètres</span>).
        </p>
      </div>
    </section>
  );
}
