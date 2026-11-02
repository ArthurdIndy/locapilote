/** Page d'attente : la simulation de vente (US11) et le budget (US12) arrivent à l'itération 4. */
export function SimulationsPage() {
  return (
    <section className="card stack">
      <h2>Simulations</h2>
      <p>Cette page accueillera bientôt deux simulations, à partir des données déjà saisies :</p>
      <ul>
        <li>
          <strong>Vente</strong> : ce qu’il te resterait si tu vendais à une date et à un prix
          donnés (frais, remboursement du prêt, impôt sur la plus-value).
        </li>
        <li>
          <strong>Budget</strong> : les recettes et dépenses prévues pour les années à venir.
        </li>
      </ul>
      <p className="muted small">Prévu pour l’itération 4.</p>
    </section>
  );
}
