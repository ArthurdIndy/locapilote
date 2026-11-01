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

**Trésorerie**

- Cash-flow = recettes encaissées − dépenses payées (hors prêt) − échéances de prêt de la période louée (jusqu'à la date de mise à jour).
- Mois de location = jours entre MAX(1er janvier, mise en location) et MIN(31 décembre, fin du mois de la date de mise à jour), divisés par 365/12.
- Cash-flow mensuel = cash-flow / mois de location.
- Enrichissement = cash-flow + capital remboursé sur la période louée.

**Rentabilité**

- Loyers annualisés = loyers hors charges / mois de location × 12.
- Rendement brut = loyers annualisés / coût total d'acquisition.
- Rendement net = (recettes − charges hors intérêts et assurance emprunteur), annualisé, / coût total d'acquisition.

## 4. Amortissements (Amortissements)

Amortissement linéaire au prorata des jours, base 365 :

```
dotation annuelle = valeur / durée
fin = date de mise en service + durée (en mois arrondis) − 1 jour
dotation de l'année N = MIN(dotation annuelle,
    MAX(0, MIN(31/12/N, fin) − MAX(01/01/N, mise en service) + 1) × dotation annuelle / 365)
```

Durée 0 = non amorti (terrain, ou bien non retenu par le comptable).

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
