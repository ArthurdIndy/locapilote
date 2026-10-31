# Locapilote

**Piloter un logement en location : loyers, dépenses, fiscalité, rentabilité et simulations, en saisissant chaque donnée une seule fois.**

Projet personnel en cours de construction (MVP prévu en décembre 2026). Il a deux objectifs : remplacer le fichier Excel avec lequel je suis mon appartement en location meublée, et apprendre à livrer un produit de bout en bout avec [Claude Code](https://claude.com/claude-code). Je tiens le rôle de product owner : cadrage, user stories, priorités, recette ; Claude Code écrit le code et les tests.

## Ce que fera le MVP

- Suivre un ou plusieurs biens, avec leur régime fiscal
- Saisir les mouvements (loyers, charges, travaux) et charger le tableau d'amortissement du prêt
- Voir chaque année le cash-flow, l'enrichissement et les rendements
- Obtenir le récapitulatif fiscal en LMNP réel (charges, amortissements par composant, report)
- Simuler une vente à plusieurs dates (somme nette, impôt sur la plus-value, TRI) et suivre un budget prévisionnel
- Exporter toutes ses données, et donner l'outil à un proche

## La démarche

1. **Diagnostic** d'un Excel de suivi existant : structure, erreurs, synthèse chiffrée.
2. **Restructuration** de l'Excel : journal unique, référentiels, fiscalité LMNP réel, contrôles.
3. **Conception produit** : personas, 19 user stories, MVP, comparaison de cinq options techniques → [`docs/conception.md`](docs/conception.md).
4. **Construction** par itérations, chacune testée sur un jeu de données réel anonymisé et comparée à l'Excel de référence → [`docs/regles-de-calcul.md`](docs/regles-de-calcul.md).

## Technique

Application web sans serveur : Vite, React, TypeScript, stockage dans le navigateur (IndexedDB), tests Vitest, hébergement Cloudflare Pages. Le moteur de calcul est séparé des écrans : un socle commun et un module par régime fiscal.

## Données

`data/` contient un jeu de test anonymisé (noms, adresses et références remplacés, montants multipliés par un même coefficient) et les résultats attendus. Aucune donnée personnelle réelle n'est publiée.

## Avertissement

Locapilote produit des estimations à des fins de suivi. Ce n'est pas un conseil fiscal : faites confirmer les règles par un expert-comptable ou sur impots.gouv.fr.

## Licence

MIT

## Développement

Prérequis : Node.js 22.

| Commande | Rôle |
| --- | --- |
| `npm install` | Installe les dépendances |
| `npm run dev` | Lance l'application en local |
| `npm test` | Lance les tests (Vitest) |
| `npm run lint` | Vérifie le code (ESLint) |
| `npm run build` | Construit le site dans `dist/` |

Mise en ligne : Cloudflare Workers (site statique, voir `wrangler.jsonc`), commande de build `npm run build`, commande de déploiement `npx wrangler deploy`.
