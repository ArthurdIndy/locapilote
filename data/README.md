# Jeu de test

Un appartement meublé en LMNP réel, acheté en novembre 2017, occupé comme résidence principale jusqu'en novembre 2023, loué via une agence depuis mai 2024. Données arrêtées au 25/10/2026.

| Fichier | Contenu |
| --- | --- |
| `jeu-de-test.xlsx` | L'outil Excel de référence (v1.2), anonymisé et recalculé. Il fait foi pour les calculs. |
| `seed.json` | Les données d'entrée : bien, catégories, 289 mouvements, prêt et 240 échéances, immobilisations, stocks d'amortissement du comptable, dépenses avant la location, hypothèses de vente. |
| `expected.json` | Les résultats attendus : synthèse 2024-2026, revente, trois scénarios de vente, contrôles. |

**Anonymisation** : noms, adresse, références bancaires et numéros de facture remplacés ; tous les montants multipliés par un même coefficient (les rapports entre montants et les règles de calcul sont donc conservés) ; dates réelles.

Pour régénérer `seed.json` et `expected.json` après une modification de l'Excel : recalculer le classeur, puis relancer le script d'export (à venir dans `scripts/`).
