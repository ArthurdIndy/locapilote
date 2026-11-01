# Modules fiscaux

Un fichier par régime fiscal (`lmnp-reel.ts`, puis `micro-bic.ts`, `micro-foncier.ts`, `reel-foncier.ts`).
Les règles sont décrites dans `docs/regles-de-calcul.md` (§ 3 et § 4, avec leurs sources).

- `lmnp-reel.ts` (US09) : dotations des immobilisations, récapitulatif annuel (`lmnpReelSummary`) et rapprochement avec les comptes déposés par le comptable (`reconcile`). Testé contre `data/expected.json` dans `lmnp-reel.test.ts`.

La synthèse annuelle (`src/engine/core/synthesis.ts`) ne calcule que la trésorerie et la rentabilité, communes à tous les régimes. Le module fiscal du régime du bien produit, pour la même année, son propre bloc (résultat, amortissements, report), affiché sur la page Fiscalité (`src/ui/pages/TaxPage.tsx`, `TaxSection.tsx`) ; la Synthèse n'en reprend que le résultat fiscal estimé. Un bien d'un régime sans module affiche « pas encore disponible pour ce régime » (et « non disponible » dans la Synthèse). Ces écrans n'appellent que le moteur : ils ne recalculent rien eux-mêmes.
