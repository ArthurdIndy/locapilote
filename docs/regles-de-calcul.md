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

- Assurance actuelle = assurance de la dernière échéance payée à la date du jour (ou de la première à venir). Quand l'échéancier montre un autre montant plus tard, l'écran du prêt signale le changement et la date de l'échéance concernée.
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
- Détail des recettes et des dépenses (replié à l'écran) : même périmètre, réparti par groupe de synthèse des catégories paramétrées ; la somme des groupes est égale au total de la ligne. Ordre : loyers d'abord, puis ordre alphabétique, groupes « Autres… » ensuite, et en dernier les groupes de catégories « À amortir » ou « À valider ». Ce détail montre ce qui a été payé, pas ce qui est déductible (voir le récapitulatif fiscal).
- Charges de copropriété restant à ma charge = dépenses du groupe « Copropriété » − recettes du groupe « Charges refacturées », de l'année civile.
- Mois de location : affichés avec deux décimales.

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
- Plus-value : voir les sources du § 5.

## 5. Revente (Revente, Vendre quand)

Moteur : `src/engine/core/sale.ts` (somme perçue, commun à tous les régimes), `src/engine/tax/capital-gain/` (un module de plus-value par régime : `private-individuals.ts` pour les règles des particuliers, `index.ts` pour le choix du module ; seul le LMNP réel est disponible, les autres régimes affichent « non calculé »), assemblés par `src/engine/sale-simulation.ts`. Testé contre les blocs « revente » et « vendre_quand » de `data/expected.json`.

**Écran (Simulations › Vente)** : il répond à « combien je touche, combien d'impôt, ai-je intérêt à attendre ». Un scénario à l'ouverture : celui du bien, ou à défaut une vente dans 12 mois au prix de la valeur estimée (Mon bien). Le jeu de test n'importe que le premier de ses trois scénarios ; les trois servent aux tests. Saisis par l'utilisateur, dans « Paramètres de vente » : frais d'agence (% du prix), frais divers de vente, indemnités de remboursement anticipé. Frais d'acquisition réels : fiche du bien (Mon bien). Les autres valeurs sont calculées (§ 6) ou sont des constantes.

**Somme perçue** = prix − frais d'agence (% du prix) − frais divers de vente − capital restant dû à la date de vente (tous les prêts du bien, échéances datées au plus tard ce jour-là) − indemnités de remboursement anticipé − impôt sur la plus-value. (Le moteur calcule aussi la somme disponible pour le prochain achat = somme nette − autres dettes ; elle n'est pas affichée.)

**Plus-value** (régime des particuliers, applicable au LMNP) :

- Durée de détention = années pleines (révolues) entre la date d'acquisition et la date de vente (comme DATEDIF « y »).
- Prix de cession = prix − frais d'agence − frais divers.
- Prix d'acquisition corrigé = prix d'achat hors mobilier + MAX(frais d'acquisition réels, 7,5 % du prix) + 15 % du prix si détention de plus de 5 ans (forfait travaux) − amortissements déduits.
- **Amortissements déduits** : depuis la loi de finances 2025 (cessions à partir du 15/02/2025), les amortissements effectivement déduits minorent le prix d'acquisition ; ceux mis en report ne le sont pas. Pour une année dont le stock du comptable est saisi : dotation + report de début − stock du comptable ; sinon les amortissements utilisés calculés. Seules les années antérieures à l'année de la vente sont comptées, à partir de l'année de mise en location. Pour les années postérieures à la date de mise à jour des données (simulation) : par défaut, les amortissements déduits de la dernière année complète (même règle : stock du comptable s'il est saisi), modifiables dans le détail ⊕ de la plus-value. Comme l'Excel de référence, Locapilote réintègre le total des amortissements déduits, sans isoler ceux du mobilier ni des travaux (voir « Point ouvert » ci-dessous).
- Plus-value = MAX(0, prix de cession − prix d'acquisition corrigé).
- Abattement impôt sur le revenu : 0 avant 6 ans, 6 % par an de la 6e à la 21e année, 100 % au-delà (la 22e année ajoute 4 %).
- Abattement prélèvements sociaux : 1,65 % par an de la 6e à la 21e année, 28 % à 22 ans (la 22e ajoute 1,60 %), puis 9 % par an, 100 % après 30 ans.
- Impôt = plus-value × (1 − abattement IR) × 19 % + plus-value × (1 − abattement PS) × 17,2 %, arrondi au centime. Les deux taux sont des constantes du module fiscal (`INCOME_TAX_RATE`, `SOCIAL_CHARGES_RATE` dans `private-individuals.ts`), sourcées ci-dessous. Surtaxe au-delà de 50 000 € de plus-value imposable à l'impôt sur le revenu : non calculée, signalée.

**Exonération pour remploi** (première cession d'un logement autre que la résidence principale, CGI art. 150 U II 1° bis) : condition remplie si la vente a lieu au moins 4 ans (de date à date) après la fin d'occupation comme résidence principale ; sans objet si le bien n'a jamais été la résidence principale. Impôt évité = impôt × part du prix réinvestie dans une résidence principale sous 24 mois (100 % par défaut, modifiable dans la ligne du remploi). Affichage : « Exonéré si tu réinvestis dans ta résidence principale (impôt évité : X €) » si la condition est remplie, sinon « Exonération possible à partir du JJ/MM/AAAA » ; rien si le bien n'a jamais été la résidence principale. Les autres conditions (première cession, pas d'autre résidence principale détenue dans les 4 ans) ne sont pas vérifiées : à confirmer avec le notaire.

**Point ouvert** (décision d'Arthur du 03/11/2026 : on garde le total, comme l'Excel ; le calcul « logement seul » est au backlog) : la notice 2048-IMM vise les « amortissements du prix d'acquisition » du logement, et exclut ceux des travaux (déjà retirés du montant réel des travaux, ligne 23). Le mobilier n'est pas dans le prix d'acquisition retenu (prix hors mobilier). L'Excel de référence, et donc `expected.json`, réintègre le total des amortissements déduits, mobilier et travaux compris. L'écran le signale sous la ligne « Amortissements déduits à réintégrer » du détail de la plus-value, avec un renvoi au notaire.

## 6. Vendre quand : d'ici la vente, gain de l'attente, bilan depuis l'achat

Moteur : `src/engine/core/irr.ts` (bilan, gain de l'attente, TRI), `src/engine/sale-defaults.ts` (valeurs calculées).

**Valeurs calculées automatiquement** (chacune remplaçable par une valeur modifiée ; vide = calcul automatique) :

- loyer net projeté par mois = recettes des 12 derniers mois du journal jusqu'à la date de mise à jour / 12 ; dépenses projetées par an = dépenses payées sur ces 12 mois, hors investissements (« À amortir ») et dépenses à qualifier (« À valider »). Si le bien est loué depuis moins de 12 mois, les montants de la période sont ramenés à un an (× 365 / jours). Le budget (US12) les fournira à l'itération 4b ;
- évolution annuelle des loyers et des charges : 1,5 % ;
- frais de l'année de la vente : honoraires du comptable (catégories dont le nom contient « comptab ») de la dernière année complète ;
- amortissements déduits des années futures : voir § 5 ;
- part du prix réinvestie : 100 %.

Le jeu de test garde les valeurs de l'Excel comme valeurs modifiées (loyer net 1 056,61 €/mois, dépenses 5 598,60 €/an, évolution 1,5 %, amortissements 4 185 €/an, frais de l'année de vente 558 €), pour que la somme nette et l'impôt retombent sur `expected.json`. Calcul automatique sur le jeu de test (données au 25/10/2026) : recettes 1 160,06 €/mois, dépenses 7 812,51 €/an, amortissements 7 307,73 €/an (2025), frais 558 €.

**Mise à jour (version 4 des données)** : les valeurs non nulles déjà saisies sont reprises comme valeurs modifiées ; celles à 0 passent en calcul automatique ; les taux de 19 % et 17,2 % sortent des hypothèses ; les frais d'acquisition réels passent sur la fiche du bien.

**Flux mensuels** du mois d'acquisition au dernier mois dont le 15 précède ou égale la date de vente, datés du 15 du mois :

- loyer évité pendant l'occupation comme résidence principale : loyer à l'achat × (1 + indexation)^(années pleines depuis l'achat), au prorata des jours du mois passés entre l'achat et la fin de la résidence principale (hypothèse du moteur, non affichée ni saisie à l'écran) ;
- échéances de prêt (toutes, y compris avant la location et après la date de mise à jour) ;
- dépenses payées avant la location (saisies à part) ;
- mouvements réels du journal jusqu'à la date de mise à jour (recettes − dépenses, transferts et dépôt exclus) ;
- pour les mois commençant après la date de mise à jour : projection mensuelle = loyer net projeté − dépenses annuelles / 12, × (1 + évolution)^(année du mois − année de la date de mise à jour).

Plus l'apport à la date d'achat (négatif) et, à la date de vente, la somme nette de la vente (sans l'exonération pour remploi) moins les frais de l'année de vente. Les flux calculés (loyer évité, projection) ne sont pas arrondis au centime, comme dans l'Excel ; ils le sont à l'affichage.

**Affiché à l'écran** :

- D'ici la vente (mois commençant après la date de mise à jour) : cash-flow à remettre = échéances + projection − frais de l'année de vente, et ce montant par mois ; « X € à remettre d'ici la vente (Y €/mois) ».
- **Gain de l'attente** entre deux scénarios triés par date = (somme nette du scénario − somme nette du précédent) + (cash-flow d'ici la vente du scénario − celui du précédent), c'est-à-dire la somme nette en plus moins le cash-flow remis entre les deux dates. Formulé « attendre jusqu'au JJ/MM/AAAA te rapporte X € de plus » (ou « te coûte X € »). Il retrouve la ligne « Gain en plus par rapport au scénario précédent » de l'onglet Vendre quand (5 276,52 € et 4 730,15 €, à 0,01 € près) : avec des scénarios postérieurs à la date des données, les autres flux sont identiques.

**Calculé par le moteur, non affiché** (décision produit du 03/11/2026 ; voir le backlog) :

- Gain total = somme des flux. TRI = taux annuel qui annule la valeur actuelle des flux datés (XIRR, base 365 jours). Testés contre `expected.json`.
- Rendement de l'attente en % = (gain total du scénario − celui du précédent) / somme nette du précédent / (écart de dates en jours / 365).
- Gain par rapport à un placement de référence au taux r = Σ flux × (1 + r)^(jours entre le flux et la date de vente / 365) ; il vaut 0 quand r est égal au TRI (test automatique). La table des paramètres du foyer reste dans les données, vide.

## Sources des règles de la plus-value (§ 5)

Vérifiées le 02/11/2026 directement sur impots.gouv.fr et bofip.impots.gouv.fr. Légifrance n'a pas pu être consulté depuis l'environnement de développement (page de vérification anti-robot) : les articles du CGI cités sont ceux mentionnés par ces pages officielles.

- **Taux 19 % et 17,2 %, abattements pour durée de détention** : [impots.gouv.fr, plus-values imposées](https://www.impots.gouv.fr/particulier/plus-values-imposees) (« impôt sur le revenu au taux de 19 % » ; « taux global de 17,2 % » ; « 6 % pour chaque année de détention au-delà de la cinquième et jusqu'à la vingt-et-unième ; 4 % pour la vingt-deuxième année révolue ») ; [BOI-RFPI-PVI-20-20 § 70](https://bofip.impots.gouv.fr/bofip/292-PGP.html/identifiant=BOI-RFPI-PVI-20-20-20230718) (prélèvements sociaux : « 1,65 % pour chaque année de détention au-delà de la cinquième et jusqu'à la vingt-et-unième ; 1,60 % pour la vingt-deuxième année de détention ; 9 % pour chaque année au-delà de la vingt-deuxième »).
- **Prélèvements sociaux en 2026 : 17,2 % maintenu pour les plus-values immobilières** : la LFSS pour 2026 (art. 12 ; CSS art. L136-8) porte la CSG de 9,2 % à 10,6 % sur les revenus du patrimoine, mais « les revenus fonciers, les plus-values immobilières, l'assurance-vie, l'épargne logement restent soumis au taux de 9,2 % » ([brochure pratique IR 2026, principales nouveautés](https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf)). Le formulaire [2048-IMM-SD de 2026 (05-2026)](https://www.impots.gouv.fr/sites/default/files/formulaires/2048-imm/2026/2048-imm_5457.pdf) applique CSG 9,2 % + CRDS 0,5 % + prélèvement de solidarité 7,5 % = 17,2 %, et l'impôt à 19 %. À noter : les revenus de location meublée (BIC), eux, passent à 18,6 % (à reprendre pour l'impôt estimé, voir le backlog).
- **Frais d'acquisition 7,5 % et forfait travaux 15 %** : CGI art. 150 VB II ; formulaire 2048-IMM 2026, lignes 22 et 23 (« montant réel ou fixé à 7,5 % du prix d'acquisition » ; « montant forfaitaire égal à 15 % du prix d'acquisition si immeuble bâti détenu depuis plus de 5 ans »).
- **Réintégration des amortissements (LF 2025, art. 84 ; CGI art. 150 VB III)** : « pour les ventes réalisées à partir du 15 février 2025, si vous étiez au régime réel, les amortissements déduits pendant la location sont retirés du prix d'achat initial », sauf certaines résidences gérées (étudiants, seniors) ([FAQ location meublée, mars 2026](https://www.impots.gouv.fr/sites/default/files/media/1_metier/5_international/actualite/faq-lmnp-03_2026.pdf) ; [impots.gouv.fr, vente d'un bien loué meublé](https://www.impots.gouv.fr/particulier/questions/je-vends-un-bien-immobilier-donne-en-location-meublee-comment-se-calcule-la), modifié le 10/07/2026). Notice [2048-IMM-NOT-SD](https://www.impots.gouv.fr/sites/default/files/formulaires/2048-imm/2025/2048-imm_5091.pdf), ligne 25 : « les amortissements du prix d'acquisition admis en déduction en application de l'article 39 C du CGI viennent en minoration de celui-ci » ; ceux des dépenses de travaux ne sont pas à reporter ligne 25 (voir le point ouvert du § 5).
- **Exonération pour remploi (CGI art. 150 U II 1° bis)** : [BOI-RFPI-PVI-10-40-30](https://bofip.impots.gouv.fr/bofip/7284-PGP.html/identifiant=BOI-RFPI-PVI-10-40-30-20210707) : le cédant ne doit pas avoir été « propriétaire de sa résidence principale au cours des quatre années précédant la cession » ; remploi sous 24 mois ; exonération « dans la limite de la fraction du prix de cession » remployée (remploi partiel : exonération au prorata).
- **Surtaxe sur les plus-values élevées** : CGI art. 1609 nonies G, au-delà de 50 000 € de plus-value imposable ; non calculée par Locapilote.

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
