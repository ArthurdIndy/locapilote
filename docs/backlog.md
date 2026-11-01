# Backlog

Idées et demandes à traiter plus tard, hors des user stories du cadrage (`docs/conception.md`).

| Sujet | Description | Origine |
| --- | --- | --- |
| Supprimer un bien | Pouvoir supprimer un bien, avec confirmation. À décider : que faire de ses mouvements, de son prêt et de ses immobilisations (suppression en cascade, ou refus tant qu'il en reste) | Recette de l'itération 1 |
| Export CSV filtré | Exporter en CSV uniquement les mouvements affichés (filtres bien, année, catégorie) depuis la page Mouvements | Recette de l'itération 1 |
| US20 · Ajout assisté par Claude | Voir le détail ci-dessous | Demande d'Arthur, 01/11/2026 |

## US20 : ajouter des mouvements avec l'aide de Claude

« En tant que propriétaire, je veux donner à Claude un relevé d'agence, un export bancaire, une facture ou une simple phrase (« j'ai payé 609 € de taxe foncière le 15/10 »), pour que les mouvements arrivent dans Locapilote sans ressaisie. »

**Exigence principale : utilisable par n'importe qui.** Toute personne à qui l'on donne Locapilote doit pouvoir s'en servir avec son propre compte Claude (offre gratuite comprise), sans dépendre d'une conversation, d'un projet ou d'instructions propres à l'auteur. Tout ce qu'il faut à Claude est fourni par l'application elle-même.

### Étape 1 : après le MVP (données dans le navigateur)

1. Dans Locapilote, un bouton « Préparer un import avec Claude » copie des instructions prêtes à coller : le format attendu (JSON documenté et versionné), la liste des biens, comptes et catégories de l'utilisateur, et les règles de classement (une recette d'agence en brut et ses honoraires à part, transferts entre comptes, etc.).
2. L'utilisateur colle ces instructions dans n'importe quelle conversation Claude, avec son document ou sa phrase. Claude rend un fichier d'import.
3. Dans Locapilote, « Importer des mouvements » **ajoute** (sans rien remplacer) après un aperçu : mouvements à ajouter, doublons probables écartés, catégories inconnues signalées. L'utilisateur valide ou décoche ligne à ligne.

Critères d'acceptation : le format d'import est documenté dans `docs/` ; les instructions générées fonctionnent dans une conversation Claude neuve ; un import ne modifie jamais les mouvements existants ; un doublon (même bien, même date, même montant, même compte) est signalé.

### Étape 2 : avec la version 2 (base en ligne et comptes)

Un connecteur Locapilote pour Claude (serveur MCP) : chaque utilisateur l'ajoute à son propre compte Claude et se connecte avec son compte Locapilote. Claude peut alors lire les catégories et proposer des mouvements ; rien n'est enregistré sans confirmation de l'utilisateur. Chaque utilisateur n'accède qu'à ses propres données.

À vérifier au moment de la construire : les offres Claude qui permettent d'ajouter un connecteur personnalisé.

