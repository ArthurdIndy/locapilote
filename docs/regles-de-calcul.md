# Règles de calcul

Référence : l'Excel `data/jeu-de-test.xlsx` (onglets indiqués entre parenthèses). Le moteur doit retrouver ses résultats, stockés dans `data/expected.json`.

> Estimations à vocation de suivi, pas un conseil fiscal. Règles vérifiées en octobre 2026 ; à confirmer avec un expert-comptable ou sur impots.gouv.fr.

## 1. Mouvements (Journal)

Chaque mouvement a une date, un bien, un compte (banque, agence…), une catégorie et un montant positif (négatif seulement pour une annulation ou une remise).

La catégorie porte :

- le **sens** : Recette, Dépense, Transfert (entre deux comptes du propriétaire) ou Neutre (dépôt de garantie) ;
- le **traitement fiscal** (LMNP réel) : Imposable, Déductible, À amortir, À valider, Non fiscal ;
- le **groupe** de synthèse (Loyers, Charges refacturées, Copropriété…) ;
- le **signe de trésorerie** (+1 ou −1), pour le solde de chaque compte.

Montant au résultat = montant si Recette, −montant si Dépense, 0 sinon. Transferts et dépôt de garantie n'entrent ni dans le résultat ni dans le cash-flow.

## 2. Prêt (Prêts, Échéancier)

L'échéancier de la banque fait foi : pour chaque échéance, capital, intérêts, assurance. Échéance totale = capital + intérêts + assurance.

- Capital restant dû à une date = montant emprunté − somme du capital des échéances payées jusqu'à cette date (incluse).
- « Période louée » : échéances dont la date est postérieure ou égale à la date de mise en location du bien. Seuls leurs intérêts et leur assurance sont déductibles.
- Le capital restant dû au 31/12 de la synthèse utilise l'échéancier complet (y compris les échéances postérieures à la date de mise à jour des données).

**Chargement du tableau de la banque** : copier-coller depuis Excel ou fichier CSV, colonnes date, capital dû, capital, intérêts, assurance. Le « capital dû » peut être celui d'avant ou d'après l'échéance : l'outil le détecte sur la première ligne en le comparant au montant emprunté. Un avertissement (non bloquant) est affiché si la somme du capital des échéances s'écarte du montant emprunté de plus d'un centime par échéance, ou si le nombre d'échéances diffère de la durée.

**Échéancier estimé** (quand on n'a pas le tableau de la banque), signalé comme tel à l'écran : mensualités constantes, mensualité hors assurance = M × t / (1 − (1 + t)^−n) avec t = taux annuel / 12 et n = durée en mois ; intérêts du mois = capital dû × t, arrondis au centime ; capital = mensualité arrondie − intérêts ; la dernière échéance solde le capital ; assurance = assurance mensuelle du prêt ; une échéance par mois à partir de la première, même jour du mois (ramené au dernier jour si besoin). La banque calcule sa première échéance au prorata des jours et arrondit à sa façon : son tableau fait foi.

## 3. Synthèse annuelle (Synthèse), par bien et par année

Les années postérieures à la date de mise à jour des données ne sont pas calculées.

**Résultat fiscal LMNP réel**

- Recettes imposables = somme des montants au résultat des catégories « Imposable ».
- Charges déductibles = catégories « Déductible » (par groupe) + intérêts et assurance emprunteur de la période louée, échéances datées au plus tard à la date de mise à jour.
- Résultat avant amortissements = recettes − charges.
- Dotation de l'année = somme des dotations des immobilisations du bien (§ 4).
- Amortissements utilisés = MIN(dotation + report du début d'année, MAX(0, résultat avant amortissements)). **Un amortissement ne crée pas de déficit** ; l'excédent est reporté sans limite de durée.
- Report en fin d'année = report de début + dotation − utilisés.
- Report du début d'année = stock retenu par le comptable pour l'année précédente s'il est saisi (il fait foi), sinon le report de fin calculé par l'outil.
- Résultat fiscal = résultat avant amortissements − amortissements utilisés.
- Si le résultat avant amortissements est négatif, c'est un **déficit** : il est affiché (résultat fiscal négatif), aucun amortissement n'est utilisé, mais son report sur les années suivantes n'est pas géré (hors périmètre de US09).
- Pour information, hors résultat : **dépenses à qualifier** (catégories « À valider », non retenues tant qu'elles ne sont pas qualifiées, avec un lien vers les mouvements concernés) et **investissements de l'année** (catégories « À amortir », à reporter dans les immobilisations).
- Recettes et charges : mouvements de l'année civile entière (comme la trésorerie). Groupes affichés : loyers d'abord, groupes « Autres… » en dernier, les autres par ordre alphabétique.
- Le module ne s'applique qu'aux biens au régime LMNP réel ; pour les autres régimes, l'écran indique que le calcul n'est pas encore disponible.

**Rapprochement avec le comptable** (par année) : on saisit les montants des comptes déposés (recettes, charges hors amortissements, dotations, résultat fiscal) et le stock d'amortissements reporté. Écart = calcul de Locapilote − montant du comptable. Statut : « OK » si l'écart ne dépasse pas 1 centime (arrondis), « Écart expliqué » si une explication est saisie, « À expliquer » sinon. Le stock de fin d'année est comparé au report de fin calculé par l'outil.

**Export** : le récapitulatif s'exporte en CSV (point-virgule, virgule décimale, UTF-8 avec BOM, une colonne par année) et en version imprimable (impression ou PDF du navigateur).

**Trésorerie**

- Recettes encaissées = mouvements des catégories de sens Recette ; dépenses payées = mouvements des catégories de sens Dépense (investissements et dépenses à qualifier compris), de l'année civile entière, même après la date de mise à jour (comme l'Excel).
- Cash-flow = recettes encaissées − dépenses payées (hors prêt) − échéances de prêt de la période louée (jusqu'à la date de mise à jour).
- Mois de location = jours entre MAX(1er janvier, mise en location) et MIN(31 décembre, fin du mois de la date de mise à jour), bornes incluses, divisés par 365/12.
- Cash-flow mensuel = cash-flow / mois de location.
- Enrichissement = cash-flow + capital remboursé sur la période louée.

**Rentabilité**

- Loyers annualisés = loyers hors charges / mois de location × 12.
- Rendement brut = loyers annualisés / coût total d'acquisition.
- Loyers hors charges = mouvements des catégories du groupe « Loyers ».
- Rendement net = (recettes − charges hors intérêts et assurance emprunteur), annualisé, / coût total d'acquisition. Les charges sont les dépenses payées hors investissements (« À amortir ») et hors dépenses à qualifier (« À valider ») ; tant que seul le LMNP réel est paramétré, c'est son traitement qui sert de référence.
- Années affichées : de l'année de mise en location à celle de la date de mise à jour des données (réglable en haut des pages Synthèse et Fiscalité, même date pour les deux ; la date du jour par défaut).

## 4. Amortissements (Amortissements)

Amortissement linéaire au prorata des jours, base 365 :

```
dotation annuelle = valeur / durée
fin = date de mise en service + durée (en mois arrondis) − 1 jour
dotation de l'année N = MIN(dotation annuelle,
    MAX(0, MIN(31/12/N, fin) − MAX(01/01/N, mise en service) + 1) × dotation annuelle / 365)
```

Durée 0 = non amorti (terrain, ou bien non retenu par le comptable).

**Arrondi** : la dotation de chaque immobilisation est calculée sans arrondi ; la dotation totale de l'année (celle du résultat fiscal) est arrondie au centime. Sur le jeu de test, cela redonne exactement les dotations des comptes déposés (5 751,05 € en 2024, 9 297,34 € en 2025), alors qu'arrondir chaque ligne donnerait 9 297,33 € en 2025.

Aucune clé de répartition n'est imposée (terrain, bâtiment, mobilier, composants) : chaque immobilisation est saisie par l'utilisateur, avec la valeur et la durée retenues par son comptable.

**Base 365** : le BOFiP prévoit un prorata « en jours » pour l'amortissement linéaire, sans fixer la longueur de l'année. La base 365 est celle de l'Excel de référence ; elle retrouve la dotation du comptable du jeu de test (réfrigérateur mis en service le 11/06/2024 : 204 jours × 215,20 € / 365 = 120,28 €, contre 119,56 € en base 360).

## Sources des règles fiscales (§ 3 et § 4)

Vérifiées le 01/11/2026. Les sites officiels n'étaient pas consultables directement depuis l'environnement de développement (accès réseau refusé) : les passages ont été vérifiés à travers les extraits des pages officielles renvoyés par un moteur de recherche. À relire sur les pages elles-mêmes lors de la recette.

- **L'amortissement ne peut ni créer ni augmenter un déficit** : article 39 C, II-2 du code général des impôts ([Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000029355753)) ; pour une location meublée, l'amortissement de l'ensemble (immeuble et meubles) « est admis en déduction du résultat imposable, au titre d'un même exercice, dans la limite du montant du loyer acquis, diminué du montant des autres charges afférentes à ces biens » ([BOI-BIC-AMT-20-40-10-20](https://bofip.impots.gouv.fr/bofip/4527-PGP.html/identifiant=BOI-BIC-AMT-20-40-10-20-20170301)).
- **L'excédent d'amortissement est reportable sans limite de durée** : la fraction non déduite « peut être déduite du résultat des exercices suivants », dans la même limite ([BOI-BIC-AMT-20-40-10-30](https://bofip.impots.gouv.fr/bofip/4555-PGP.html/identifiant=BOI-BIC-AMT-20-40-10-30-20120912)) ; pour le LMNP, « les amortissements non déduits sont reportables sur les années suivantes sans limitation dans le temps », le report cessant à la vente du logement ou à l'arrêt de la location ([impots.gouv.fr, les régimes d'imposition](https://www.impots.gouv.fr/particulier/les-regimes-dimposition)).
- **Intérêts et assurance emprunteur déductibles** : au réel, le loueur meublé déduit ses dépenses effectivement payées, dont les intérêts d'emprunt ([impots.gouv.fr, FAQ régime des locations meublées, mars 2026](https://www.impots.gouv.fr/sites/default/files/media/1_metier/5_international/actualite/faq-lmnp-03_2026.pdf)) ; les intérêts sont des charges financières déductibles ([BOI-BIC-CHG-50-20-10](https://bofip.impots.gouv.fr/bofip/990-PGP.html/identifiant=BOI-BIC-CHG-50-20-10-20120912)) ; les primes d'une assurance garantissant le remboursement d'un prêt, **lorsqu'elle est imposée par le contrat de prêt**, « revêtent le caractère de charges financières au même titre que l'intérêt » ([BOI-BIC-CHG-40-20-20](https://bofip.impots.gouv.fr/bofip/803-PGP.html/identifiant=BOI-BIC-CHG-40-20-20-20130408)).
- **Amortissement au prorata temporis** : le point de départ de l'amortissement linéaire est le jour de la mise en service effective, et la première annuité est réduite au prorata du temps écoulé ; pour le linéaire, le temps s'apprécie en jours ([BOI-BIC-AMT-20-10](https://bofip.impots.gouv.fr/bofip/4543-PGP.html/identifiant=BOI-BIC-AMT-20-10-20120912), [BOI-BIC-AMT-20-20-30](https://bofip.impots.gouv.fr/bofip/4699-PGP.html/identifiant=BOI-BIC-AMT-20-20-30-20120912)).
- Pour mémoire (plus-value, itération 4) : depuis la loi de finances pour 2025, les amortissements déduits viennent réduire le prix d'acquisition (§ 5).

## 5. Revente (Revente, Vendre quand)

**Somme perçue** = prix − frais d'agence − frais divers de vente − capital restant dû à la date de vente − indemnités de remboursement anticipé − impôt sur la plus-value.

**Plus-value** (régime des particuliers, applicable au LMNP) :

- Durée de détention = années pleines entre la date d'acquisition et la date de vente.
- Prix de cession = prix − frais d'agence − frais divers.
- Prix d'acquisition corrigé = prix d'achat hors mobilier + MAX(frais d'acquisition réels, 7,5 % du prix) + 15 % du prix si détention de plus de 5 ans (forfait travaux) − amortissements déduits.
- **Amortissements déduits** : depuis la loi de finances 2025 (cessions à partir du 15/02/2025), les amortissements effectivement déduits sont réintégrés ; ceux mis en report ne le sont pas, ni ceux du mobilier. Pour une année dont le stock du comptable est saisi : dotation + report de début − stock du comptable ; sinon les amortissements utilisés calculés. Seules les années antérieures à l'année de la vente sont comptées. Pour les années futures (simulation) : hypothèse annuelle saisie.
- Plus-value = MAX(0, prix de cession − prix d'acquisition corrigé).
- Abattement impôt sur le revenu : 0 avant 6 ans, 6 % par an de la 6e à la 21e année, 100 % au-delà (la 22e année ajoute 4 %).
- Abattement prélèvements sociaux : 1,65 % par an de la 6e à la 21e année, 28 % à 22 ans, puis 9 % par an, 100 % après 30 ans.
- Impôt = plus-value × (1 − abattement IR) × 19 % + plus-value × (1 − abattement PS) × 17,2 %. Surtaxe au-delà de 50 000 € de plus-value imposable : non calculée, signalée.

**Exonération pour remploi** (première cession d'un logement autre que la résidence principale, CGI art. 150 U II 1° bis) : condition remplie si la vente a lieu au moins 4 ans (de date à date) après la fin d'occupation comme résidence principale ; impôt évité = impôt × part du prix réinvestie dans une résidence principale sous 24 mois.

## 6. Vendre quand : bilan depuis l'achat

Flux mensuels, du mois d'acquisition à la date de vente :

- loyer évité pendant l'occupation comme résidence principale (hypothèse indexée chaque année, au prorata des jours du mois) ;
- échéances de prêt (toutes, y compris avant la location) ;
- dépenses payées avant la location (saisies à part) ;
- mouvements réels du journal jusqu'à la date de mise à jour ;
- après la date de mise à jour : projection mensuelle = loyer net projeté − dépenses annuelles / 12, indexée chaque année.

Plus l'apport à la date d'achat (négatif) et la somme nette de la vente moins les frais de l'année de vente.

- Gain total = somme des flux. TRI = taux annuel qui annule la valeur actuelle des flux datés (XIRR, base 365 jours).
- Rendement de l'attente entre deux scénarios = (gain du scénario − gain du précédent) / somme nette du précédent / (écart de dates en années).

## 7. Type de location et régime fiscal (Biens)

Le régime fiscal proposé dépend du type de location ; une combinaison incohérente est refusée.

| Type de location | Régimes possibles |
| --- | --- |
| Meublée | LMNP micro-BIC, LMNP réel, LMP réel |
| Saisonnière (meublé de tourisme) | LMNP micro-BIC, LMNP réel, LMP réel |
| Nue | Micro-foncier, réel foncier |

Si le type de location change et que le régime n'est plus compatible, le régime est vidé et doit être choisi à nouveau.

Sources :

- location de locaux d'habitation meublés imposée dans la catégorie des bénéfices industriels et commerciaux (BIC) : article 35, I-5° bis du code général des impôts ;
- distinction entre loueur en meublé non professionnel (LMNP) et professionnel (LMP) : article 155, IV du code général des impôts ;
- location nue imposée dans la catégorie des revenus fonciers : article 14 du code général des impôts ; présentation sur impots.gouv.fr (revenus fonciers et locations meublées).
