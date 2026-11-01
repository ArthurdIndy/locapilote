# Modules fiscaux

Un fichier par régime fiscal (`lmnp-reel.ts`, puis `micro-bic.ts`, `micro-foncier.ts`, `reel-foncier.ts`).
Premier module prévu à l'itération 3 (US09). Les règles sont décrites dans `docs/regles-de-calcul.md`.

La synthèse annuelle (`src/engine/core/synthesis.ts`) ne calcule que la trésorerie et la rentabilité, communes à tous les régimes. Le module fiscal du régime du bien produira, pour la même année, son propre bloc (résultat, amortissements, report), affiché sous la synthèse à la place de l'encart « Résultat fiscal ».
