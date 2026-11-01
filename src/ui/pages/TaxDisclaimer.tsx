/** Mention affichée sur chaque écran fiscal (CLAUDE.md, « Fiscalité »). */
export function TaxDisclaimer() {
  return (
    <p className="muted small tax-disclaimer">
      Estimation à vocation de suivi, pas un conseil fiscal. Fais confirmer ces montants par un
      expert-comptable ou sur{' '}
      <a href="https://www.impots.gouv.fr" target="_blank" rel="noreferrer">
        impots.gouv.fr
      </a>
      .
    </p>
  );
}
