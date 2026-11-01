# Backlog

Idées et demandes à traiter plus tard, hors des user stories du cadrage (`docs/conception.md`).

| Sujet | Description | Origine |
| --- | --- | --- |
| Supprimer un bien | Pouvoir supprimer un bien, avec confirmation. À décider : que faire de ses mouvements, de son prêt et de ses immobilisations (suppression en cascade, ou refus tant qu'il en reste) | Recette de l'itération 1 |
| Export CSV filtré | Exporter en CSV uniquement les mouvements affichés (filtres bien, année, catégorie) depuis la page Mouvements | Recette de l'itération 1 |
| Navigation : 6 entrées | Voir le détail ci-dessous | Recette de l'itération 3, décision du 01/11/2026 · **fait à l'itération 3 bis** |
| US20 · Assistant Claude | Voir le détail ci-dessous | Demande d'Arthur, 01/11/2026 |
| Assurance emprunteur variable | La carte du prêt affiche l'assurance comme une valeur fixe (« assurance 21,59 € / mois ») alors qu'elle peut changer en cours de prêt (dans le jeu de test, elle baisse en décembre 2032 et l'échéance avec elle). Afficher l'assurance de l'échéance en cours (« assurance actuelle ») et signaler qu'elle varie, avec la date du changement | Recette de l'itération 2 · **fait à l'itération 3 bis** |
| Synthèse : détail des recettes et des dépenses | Voir le détail ci-dessous | Recette de l'itération 2, demande d'Arthur · **fait à l'itération 3 bis** |
| Mois de location : décimales | Le nombre de décimales des mois de location varie dans la synthèse (« 7,5 » mais « 9,99 »). Toujours afficher deux décimales | Recette de l'itération 2 · **fait à l'itération 3 bis** |
| Impôt estimé et cash-flow après impôt | Voir le détail ci-dessous | Demande d'Arthur, 01/11/2026 |

## Synthèse : détail des recettes et des dépenses

« En tant que propriétaire, je veux voir de quoi sont faites mes recettes et mes dépenses de l'année, pour repérer ce qui pèse sur le cash-flow (petits travaux, ballon d'eau chaude…) et ce que les charges de copropriété me coûtent vraiment. »

À faire juste après l'itération 3 (même écran), niveau de réflexion moyen.

Dans le bloc Trésorerie de la synthèse :

- **Recettes encaissées ⊕** : un « + » ouvre le détail par groupe (loyers hors charges, charges refacturées au locataire, autres recettes) ; un « − » le referme.
- **Dépenses payées (hors prêt) ⊕** : même principe, détail par groupe (copropriété, frais de gestion, impôts et taxes, assurances, entretien et petit équipement, investissements à amortir, dépenses à qualifier).
- **Échéances de prêt (période louée) ⊕** : les lignes « dont capital », « dont intérêts », « dont assurance », aujourd'hui toujours visibles, passent dans un détail replié, comme les deux lignes précédentes.
- **Rentabilité** : le rendement brut et le rendement net restent visibles ; les lignes « Loyers hors charges » et « Loyers annualisés » passent dans un détail replié ⊕.
- **Restent toujours visibles** : cash-flow, mois de location, cash-flow mensuel moyen, capital remboursé, enrichissement, rendements, patrimoine.
- **Charges de copropriété restant à ma charge** : charges de copropriété payées − charges refacturées au locataire, par année.

Critères d'acceptation :

- les détails sont fermés par défaut ; l'état ouvert ou fermé est mémorisé dans le navigateur ;
- la somme des lignes de détail est égale au total de la ligne (contrôlé par un test) ;
- un clic sur une ligne de détail ouvre la page Mouvements filtrée sur ce groupe et cette année (pour retrouver le ballon d'eau chaude, par exemple) ;
- les groupes viennent des catégories paramétrées : un nouveau groupe apparaît sans modification du code ;
- ce détail montre ce qui a été payé ; il ne remplace pas le récapitulatif fiscal (ce qui est déductible) ;
- lisible sur téléphone, dans la carte de chaque année.

## Impôt estimé et cash-flow après impôt

« En tant que propriétaire, je veux savoir combien d'impôt me coûte ma location et ce qu'il me reste après impôt, pour relier le résultat fiscal à mon argent. »

Le résultat fiscal (US09) n'est pas de l'argent : c'est la base de l'impôt. Pour un LMNP au réel avec un résultat nul, l'impôt est nul ; pour un bien en micro-BIC ou un résultat positif, c'est souvent le premier poste de dépense.

- Paramètre du foyer (pas du bien) : tranche marginale d'imposition (0, 11, 30, 41 ou 45 %), saisie par l'utilisateur.
- **Impôt estimé** de l'année = résultat fiscal positif × (tranche marginale + prélèvements sociaux).
- **Cash-flow après impôt** = cash-flow − impôt estimé, dans la synthèse ; mensualisé comme le cash-flow.
- Calcul simplifié, signalé comme tel : pas de calcul complet du barème, ni de quotient familial.

À vérifier au moment de la construire (règles à sourcer dans `docs/regles-de-calcul.md`) : taux des prélèvements sociaux applicables aux revenus de location meublée non professionnelle (17,2 %, ou taux relevé par une loi de finances récente), barème en vigueur, imputation d'un déficit.

## US20 : tout mettre à jour en langage naturel, avec l'aide de Claude

« En tant que propriétaire, je veux pouvoir dire à Claude, à l'oral ou par écrit, ce qui s'est passé, ou lui donner le document que j'ai reçu, pour que Locapilote soit mis à jour sans ressaisie. »

Exemples : « j'ai payé 572 € de taxe foncière hier » ; le relevé mensuel de l'agence ; un avis de taxe ou de CFE ; le nouvel échéancier après une renégociation du prêt ; une facture de travaux à amortir ; un nouveau loyer après révision.

**Toutes les données sont concernées**, pas seulement les mouvements : mouvements, prêts et échéanciers (une renégociation remplace les échéances futures et garde l'historique), immobilisations, biens (loyer, valeur estimée), hypothèses de vente.

**Automatique, mais jamais à l'aveugle** : Claude prépare les modifications, affiche un récapitulatif clair (« j'ajoute 1 mouvement de 572 € en Taxe foncière ; je remplace 133 échéances futures du prêt »), et rien n'est enregistré sans confirmation. Une erreur de lecture finirait sinon dans la déclaration fiscale.

**Complémentaire** : la saisie manuelle et les imports restent disponibles.

**Exigence principale : utilisable par n'importe qui.** Toute personne à qui l'on donne Locapilote doit pouvoir s'en servir avec son propre compte Claude (offre gratuite comprise), sans dépendre d'une conversation, d'un projet ou d'instructions propres à l'auteur. Tout ce qu'il faut à Claude est fourni par l'application elle-même.

### Étape 1 : après le MVP (données dans le navigateur)

1. Dans Locapilote, un bouton « Préparer un import avec Claude » copie des instructions prêtes à coller : le format attendu (JSON documenté et versionné, couvrant tous les types de données), la liste des biens, comptes, prêts et catégories de l'utilisateur, et les règles de classement (une recette d'agence en brut et ses honoraires à part, transferts entre comptes, etc.).
2. L'utilisateur colle ces instructions dans n'importe quelle conversation Claude, avec son document ou sa phrase. Claude rend un fichier d'import.
3. Dans Locapilote, « Appliquer des modifications » montre un aperçu (ajouts, remplacements, doublons probables écartés, catégories inconnues signalées) ; l'utilisateur valide ou décoche ligne à ligne. Rien n'est remplacé sans être listé.

Critères d'acceptation : le format d'import est documenté dans `docs/` ; les instructions générées fonctionnent dans une conversation Claude neuve ; aucune donnée existante n'est modifiée sans apparaître dans l'aperçu ; un doublon (même bien, même date, même montant, même compte) est signalé.

### Étape 2 : avec la version 2 (base en ligne et comptes)

Un connecteur Locapilote pour Claude (serveur MCP) : chaque utilisateur l'ajoute à son propre compte Claude et se connecte avec son compte Locapilote. L'utilisateur parle ou dépose un document dans n'importe quelle conversation ; Claude lit ses données, propose les modifications, et les enregistre directement après sa confirmation. C'est l'étape « tout à l'oral ». Chaque utilisateur n'accède qu'à ses propres données.

À vérifier au moment de la construire : les offres Claude qui permettent d'ajouter un connecteur personnalisé.

## US21 : tableau de bord d'accueil (itération 5)

« En tant que propriétaire, je veux voir d'un coup d'œil, sur l'accueil, où j'en suis aujourd'hui et ce que j'ai à faire. »

**Rôle de chaque écran** (décision du 01/11/2026) : l'accueil répond à « où j'en suis aujourd'hui, et que dois-je faire ? » ; la synthèse répond à « comment s'est passée chaque année ? », avec tout le détail. L'accueil n'affiche que ce que la synthèse ne montre pas, ou ce qui mérite d'être vu d'un coup d'œil. On ajustera à l'usage.

Contenu, **dans la carte de chaque bien** de l'Accueil (règle multi-biens, voir `docs/conception.md`, Choix d'architecture : l'Accueil est la seule page qui montre tous les biens) :

| Bloc | Contenu | Source |
| --- | --- | --- |
| Trois indicateurs de l'année en cours | Cash-flow mensuel moyen | Synthèse (US08) |
| | Enrichissement de l'année | Synthèse (US08) |
| | Somme nette si je vends aujourd'hui | Simulation de vente (US11), à la date du jour |
| À faire | Mouvements « À valider » à qualifier | Mouvements |
| | Date du dernier mouvement saisi (« données à jour au … ») | Mouvements |
| | Rappel quand la dernière sauvegarde date de plus d'un mois (commun à tous les biens : au-dessus des cartes) | Export (US18) |
| Accès | La carte entière : un clic ouvre la synthèse du bien | — |

Restent dans la synthèse, pas sur l'accueil : rendement net, résultat fiscal estimé, capital restant dû (compris dans la somme nette).

Critères d'acceptation :

- chaque indicateur affiche la comparaison avec l'année précédente (« −421 €/mois, contre −257 € en 2025 ») ;
- la somme nette précise sur quelle valeur elle repose (« sur la base d'une valeur de 305 000 €, estimée le … ») ;
- cette valeur estimée se modifie directement depuis l'accueil, ce qui met à jour la somme nette et la fiche du bien ;
- la fiche du bien enregistre la date de l'estimation ; au-delà de 6 mois, l'accueil propose de la mettre à jour ;
- le bloc « À faire » est vide (« Rien à traiter ») quand tout est à jour ;
- un clic sur la carte d'un bien en fait le bien courant et ouvre sa synthèse ;
- lisible sur téléphone (cartes et indicateurs empilés).

## Navigation : 6 entrées au lieu de 10

« En tant que propriétaire, je veux trouver vite ce que je consulte souvent, sans être noyé dans les écrans de paramétrage. »

Avec l'itération 4 (vente, budget), le menu passerait à 10 onglets. Les écrans sont regroupés par fréquence d'usage : consulter (souvent), saisir (chaque mois), paramétrer (rarement).

À faire juste avant l'itération 4, dans la même session que le détail replié de la synthèse (travail d'interface, niveau de réflexion moyen), pour que la vente et le budget arrivent directement dans « Simulations ».

| Entrée | Contient |
| --- | --- |
| Accueil | Tableau de bord (US21) |
| Mouvements | Saisie et liste |
| Synthèse | Trésorerie, rentabilité, patrimoine |
| Fiscalité | Récapitulatif fiscal, rapprochement avec le comptable, export (US09) |
| Simulations | Vente (US11), budget (US12) |
| Mon bien | Fiche du bien en trois sections : informations, prêt, immobilisations ; choix du bien quand il y en a plusieurs |

Icône ⚙ en haut à droite : Données (export, import, jeu de test), puis plus tard les catégories et les paramètres du foyer (tranche d'imposition).

Critères d'acceptation :

- sur ordinateur, les 6 entrées tiennent sur une ligne, plus l'icône ⚙ ;
- sur téléphone (375 px), Accueil, Mouvements, Synthèse, Fiscalité et Simulations sont sur une ligne d'onglets en haut qui défile (sous l'en-tête, onglet actif ramené au centre, dégradé sur le bord) ; « Mon bien » et ⚙ passent dans le menu ☰ en haut à droite ;
- les anciennes adresses (Biens, Prêt, Immobilisations, Données) redirigent vers leur nouvelle place ;
- les liens internes existants (« Voir le mouvement concerné », « immobilisations », « Données ») mènent toujours au bon endroit ;
- tests de parcours mis à jour.
