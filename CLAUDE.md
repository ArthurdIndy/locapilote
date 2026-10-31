# Locapilote : instructions pour Claude Code

## Le produit

Locapilote aide un particulier à piloter un logement qu'il loue : saisir loyers et dépenses une seule fois, puis en tirer le cash-flow, la rentabilité, le résultat fiscal et des simulations (vente, budget). Cible : le propriétaire et quelques proches, 1 à 3 biens, en meublé (LMNP) ou en location nue.

Le cadrage complet (personas, user stories, MVP, roadmap) est dans `docs/conception.md`. Les règles de calcul sont dans `docs/regles-de-calcul.md` : à lire avant de toucher au moteur de calcul.

## Avec qui tu travailles

- Arthur est le product owner. Il n'est pas développeur : explique tes choix simplement, en français, sans jargon inutile.
- On avance **une user story par session**. En fin de session, donne : ce qui a été fait, comment le tester (pas à pas, dans le navigateur), ce qui reste.
- Travaille sur une branche par story (`us03-saisie-mouvements`), puis ouvre une pull request. Arthur fait la recette et fusionne.
- Messages de commit en français, courts, à l'impératif (« Ajoute la saisie d'un mouvement »).
- Pose une question plutôt que de supposer une règle métier ou fiscale.

## Principes produit (non négociables)

1. **Multi-biens** : toute donnée est rattachée à un bien, même s'il n'y en a qu'un.
2. **Réutilisable** : aucune donnée personnelle en dur ; tout ce qui varie (biens, catégories, régime, hypothèses) est paramétrable.
3. **Mono-utilisateur pour l'instant** : pas de comptes, mais rien qui empêche d'en ajouter (version 2 : base en ligne et comptes).
4. **Données saisies une seule fois**, réutilisées par toutes les vues.
5. **Un socle commun et un module par régime fiscal** : cash-flow, prêt et rentabilité ne dépendent pas du régime ; le calcul fiscal est un module (LMNP réel d'abord ; micro-BIC, micro-foncier, réel foncier ensuite).

## Architecture

- Application web sans serveur : Vite, React, TypeScript (mode strict).
- Données stockées dans le navigateur (IndexedDB, via Dexie). Export et import complets en JSON, export Excel/CSV.
- `src/engine/` : moteur de calcul en **fonctions pures**, sans dépendance à React ni au stockage. Sous-dossiers `core/` (prêt, cash-flow, rentabilité, TRI) et `tax/` (un fichier par régime).
- `src/db/` : schéma et accès aux données. `src/ui/` : écrans.
- Montants manipulés en **centimes entiers** dans le moteur ; conversion en euros seulement à l'affichage.
- Dates en chaînes ISO `AAAA-MM-JJ` ; jamais de calcul de date dépendant du fuseau horaire.
- Tests avec Vitest. Mise en ligne sur Cloudflare Pages.
- Code et noms techniques en anglais ; interface, documentation et commits en français. Glossaire : bien = property, mouvement = transaction, catégorie = category, échéance de prêt = loan installment, immobilisation = asset, amortissement = depreciation, report = carryforward, régime = tax regime.

## Données de test

- `data/seed.json` : un bien réel anonymisé (appartement meublé en LMNP réel, acheté en 2017, loué depuis 2024), avec mouvements, prêt, échéancier, immobilisations et hypothèses.
- `data/expected.json` : les résultats attendus (synthèse annuelle, revente, scénarios de vente, contrôles), calculés par l'Excel de référence `data/jeu-de-test.xlsx`.
- Tout calcul du moteur doit retrouver `expected.json` à 0,01 € près (0,0001 pour les taux). Si un écart apparaît, signale-le avant de modifier un test.
- **Ne jamais committer de données personnelles réelles** (noms, adresses, relevés, montants réels). Le dépôt est public.

## Une story est terminée quand

- les tests passent (`npm test`) et le build aussi (`npm run build`) ;
- les chiffres concernés retombent sur `data/expected.json` ;
- l'écran est utilisable en français, sur ordinateur et sur téléphone ;
- Arthur a fait la recette sur la pull request.

## Fiscalité

L'outil donne des estimations, pas un conseil fiscal. Chaque écran fiscal l'indique et renvoie vers un expert-comptable ou impots.gouv.fr. Ne change pas une règle fiscale sans la sourcer (BOFiP, impots.gouv.fr, loi de finances) dans `docs/regles-de-calcul.md`.
