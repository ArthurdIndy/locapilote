import { useState } from 'react';
import { db } from '../../db/database';
import { startEmpty, startWithTestDataset } from '../../db/setup';

/** Premier lancement : la base est vide, l'utilisateur choisit comment démarrer. */
export function WelcomePage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (action: () => Promise<void>, route: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      window.location.hash = route;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <section className="card welcome">
      <h2>Bienvenue</h2>
      <p>
        Locapilote t’aide à suivre un logement que tu loues : loyers, dépenses, puis cash-flow,
        rentabilité et fiscalité. Tes données restent dans ce navigateur.
      </p>
      <p>Comment veux-tu commencer ?</p>
      <div className="choices">
        <button
          type="button"
          className="choice"
          disabled={busy}
          onClick={() => start(() => startWithTestDataset(db), '#/accueil')}
        >
          <strong>Commencer avec le jeu de test</strong>
          <span>
            Un appartement fictif avec 289 mouvements et son prêt, pour découvrir l’outil.
          </span>
        </button>
        <button
          type="button"
          className="choice"
          disabled={busy}
          onClick={() => start(() => startEmpty(db), '#/mon-bien')}
        >
          <strong>Démarrer vide</strong>
          <span>
            Tu crées ton bien et tu saisis tes mouvements. Les catégories usuelles sont prêtes.
          </span>
        </button>
      </div>
      <p className="muted small">
        Tu pourras changer d’avis plus tard depuis ⚙ Paramètres (import d’une sauvegarde ou du jeu
        de test).
      </p>
      {error && <p className="error-text">Erreur : {error}</p>}
    </section>
  );
}
