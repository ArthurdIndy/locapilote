# Locapilote : conception produit

Octobre 2026 · Arthur d'Indy (product owner), avec Claude

## Point de départ

Un appartement meublé loué en LMNP réel, suivi pendant des années dans un fichier Excel. Après un diagnostic (doublons, formules cassées, catégories incohérentes, fiscalité absente), l'Excel a été restructuré : journal unique, référentiels, échéancier du prêt, amortissements, synthèse fiscale, contrôles et simulateur de vente. Locapilote en fait un produit réutilisable. La version anonymisée de cet Excel sert de référence de calcul (`data/jeu-de-test.xlsx`).

## Vision et objectifs

Un outil simple pour qu'un particulier qui loue un appartement suive ses loyers, ses dépenses, sa fiscalité et la rentabilité de son bien, en saisissant chaque donnée une seule fois.

Deux objectifs de même poids :

- **Utile** : remplacer l'Excel jusqu'à la vente du bien, puis servir pour un autre bien ou un proche.
- **Apprendre** : livrer un produit de bout en bout avec Claude Code (modèle de données, code, tests, mise en ligne, itérations).

Indicateurs de réussite :

1. Le bien de référence est suivi uniquement dans Locapilote.
2. Un proche crée son bien et saisit son premier mois seul, en moins de 30 minutes.
3. Le récapitulatif LMNP réel retombe sur les comptes du comptable, ou l'écart est expliqué.
4. Chaque itération est livrée en une à deux semaines.

Hors cible : professionnels, SCI, gestion complète du locataire.

## Profils

| Profil | Situation | Ce qu'il veut |
| --- | --- | --- |
| Bailleur LMNP réel | Un meublé géré par une agence, un comptable | Savoir ce que le bien coûte et rapporte, préparer la liasse, décider quand vendre |
| Bailleur en location nue | Un appartement loué en direct, au micro-foncier | Savoir quoi déclarer, suivre loyers et charges |
| Futur bailleur | Envisage d'acheter pour louer | Simuler un achat : cash-flow, rendement, régime fiscal |

## User stories

« En tant que propriétaire, je veux… »

| ID | Épopée | Je veux… | Critère d'acceptation | Priorité |
| --- | --- | --- | --- | --- |
| US01 | Biens | Créer un bien avec son régime fiscal, sa date d'achat, son coût et sa date de mise en location | Le bien apparaît dans toutes les vues ; changer de régime ne demande aucune ressaisie | Must |
| US02 | Biens | Adapter les catégories de recettes et de dépenses | Chaque catégorie porte son traitement fiscal pour chaque régime | Should |
| US03 | Mouvements | Saisir un mouvement (date, bien, catégorie, montant, pièce) | Moins de 30 secondes, catégorie choisie dans une liste | Must |
| US04 | Mouvements | Importer le CSV de ma banque en ne gardant que les lignes du bien | Doublons détectés ; règles de catégorisation retenues | Should |
| US05 | Mouvements | Importer le relevé de l'agence | Solde de l'agence rapproché au centime | Could |
| US06 | Mouvements | Joindre une pièce justificative | La pièce s'ouvre depuis le mouvement | Could |
| US07 | Prêt | Charger le tableau d'amortissement de la banque | Capital, intérêts, assurance par an ; capital restant dû à toute date | Must |
| US08 | Suivi | Voir par bien et par année recettes, dépenses, cash-flow, enrichissement, rendements | Mêmes chiffres que l'Excel de référence | Must |
| US09 | Fiscalité | Obtenir le récapitulatif LMNP réel | Retombe sur les comptes du comptable, écarts expliqués | Must |
| US10 | Fiscalité | Obtenir le montant à déclarer en micro-BIC, micro-foncier ou réel foncier | La case de la déclaration est indiquée | Should |
| US11 | Simulations | Comparer plusieurs dates et prix de vente | Mêmes chiffres que l'onglet « Vendre quand » | Must |
| US12 | Simulations | Construire un budget prévisionnel et suivre l'écart avec le réel | Écart par catégorie, mois par mois | Must |
| US13 | Simulations | Simuler un achat | Projection sur 10 ans, micro et réel comparés | Should |
| US14 | Simulations | Comparer micro et réel pour un bien existant | Différence d'impôt par année | Could |
| US15 | Échéances | Être prévenu des échéances (taxe foncière, CFE, charges, IRL, liasse) | Liste des 30 prochains jours | Should |
| US16 | Contrôles | Voir les anomalies | Une liste à traiter, vide quand tout va bien | Should |
| US17 | Partage | Donner l'outil à un proche sans qu'il voie mes données | Il démarre vide, avec ses propres paramètres | Must |
| US18 | Partage | Exporter toutes mes données | Rien n'est perdu si j'arrête l'outil | Must |
| US19 | Locataire | Quittances, révision IRL, régularisation des charges | À préciser | Won't (pour l'instant) |
| US20 | Mouvements | Ajouter des mouvements depuis un document (relevé d'agence, export bancaire, facture) ou une simple phrase, avec l'aide de Claude | Fonctionne pour tout utilisateur, avec n'importe quel compte Claude (gratuit compris), sans dépendre de la conversation de l'auteur ; aperçu avant ajout, doublons écartés | Should (après le MVP) |

## MVP

Les 9 stories Must : US01, US03, US07, US08, US09, US11, US12, US17, US18. Plus la reprise des données de l'Excel et un modèle de données multi-biens et multi-régimes dès le départ.

Le MVP est terminé quand :

- [ ] le jeu de test est entièrement repris (289 mouvements, 240 échéances, immobilisations) ;
- [ ] la synthèse et la simulation de vente retombent sur `data/expected.json` ;
- [ ] un budget annuel est saisi et comparé au réel mois par mois ;
- [ ] un proche crée son bien et saisit son premier mois seul en moins de 30 minutes ;
- [ ] l'export complet se rouvre sans perte ;
- [ ] des tests automatiques vérifient les calculs.

Après le MVP, dans cet ordre : base en ligne et comptes (données sur tous les appareils), import CSV de la banque, simulateur d'achat, autres régimes fiscaux, échéances et contrôles, import du relevé de l'agence, pièces justificatives.

## Options étudiées

| Option | Pour | Contre | Décision |
| --- | --- | --- | --- |
| Excel amélioré | Déjà là, calculs vérifiés | Saisie lourde, une copie par personne, peu formateur | Gardé comme référence de calcul |
| Google Sheets + scripts | Gratuit, import par script | Lent, difficile à tester | Non |
| No-code | Interfaces rapides, comptes | Calculs fiscaux difficiles, abonnement, dépendance | Non |
| **Application web avec Claude Code** | Tout est possible, testable, très formateur | Plus long | **Retenue** |
| Artifact Claude | En ligne en quelques jours | Dépend de claude.ai, peu de tests | Non |

## Choix d'architecture

Application web sans serveur ; données dans le navigateur de chaque utilisateur, export complet comme sauvegarde. Moteur de calcul séparé des écrans : un socle commun (cash-flow, prêt, rentabilité, TRI) et un module par régime fiscal. Version 2 : base en ligne et comptes, avec le même modèle de données.

Pourquoi le web plutôt qu'une application de bureau : partage par simple lien, mises à jour automatiques, pas d'installeur à signer, accessible sur tous les appareils.

## Roadmap

| Itération | Contenu | Période (2026) |
| --- | --- | --- |
| 0 · Mise en place | Dépôt, outils, jeu de test anonymisé, squelette | 31 octobre au 6 novembre |
| 1 · Biens et mouvements | US01, US03, US18 | 9 au 13 novembre |
| 2 · Prêt et synthèse | US07, US08 | 16 au 20 novembre |
| 3 · Fiscalité LMNP réel | US09, contrôle sur l'Excel | 23 au 27 novembre |
| 4 · Simulations | US11, US12 | 30 novembre au 4 décembre |
| 5 · Partage | US17, MVP livré | 7 et 8 décembre |
| Version 2 | Base en ligne et comptes, import CSV, simulateur d'achat | À partir du 9 décembre |
