/** Mention affichée avec chaque simulation de vente et chaque indicateur de rentabilité réelle. */
export function SaleDisclaimer() {
  return (
    <p className="muted small tax-disclaimer">
      Estimation à vocation de suivi, pas un conseil fiscal ni un conseil en investissement. La
      plus-value, l’exonération pour remploi et la surtaxe sont à confirmer avec un notaire ou sur{' '}
      <a href="https://www.impots.gouv.fr" target="_blank" rel="noreferrer">
        impots.gouv.fr
      </a>
      .
    </p>
  );
}
