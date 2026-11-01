/** Recette US08 : synthèse annuelle par bien, comparée à data/expected.json. */
import type { Locator, Page } from '@playwright/test';
import {
  capture,
  dec,
  eur,
  expect,
  expected,
  expectNoHorizontalScroll,
  goTo,
  isPhone,
  pct,
  seed,
  startWithTestData,
  test,
} from './helpers';

type Line = Record<string, number | null>;
const line = (label: string): Line => (expected.synthese as Record<string, Line>)[label]!;

/** Libellé à l'écran → valeurs attendues (expected.json) mises en forme comme à l'écran. */
const CHECKS: [string, (year: string) => string][] = [
  ['Recettes encaissées', (y) => eur(line('Encaissements (recettes)')[y]!)],
  ['Dépenses payées (hors prêt)', (y) => eur(line('Dépenses payées (hors prêt)')[y]!)],
  ['Échéances de prêt (période louée)', (y) => eur(line('Échéances de prêt (période louée)')[y]!)],
  ['dont capital', (y) => eur(line('dont capital remboursé')[y]!)],
  ['dont intérêts', (y) => eur(line("Intérêts d'emprunt (période louée)")[y]!)],
  ['dont assurance', (y) => eur(line('Assurance emprunteur (période louée)')[y]!)],
  ['Cash-flow', (y) => eur(line('Cash-flow')[y]!)],
  ['Mois de location', (y) => dec(line('Mois de location sur la période')[y]!)],
  ['Cash-flow mensuel moyen', (y) => eur(line('Cash-flow mensuel moyen')[y]!)],
  ['Capital remboursé', (y) => eur(line('dont capital remboursé')[y]!)],
  [
    'Enrichissement (cash-flow + capital remboursé)',
    (y) => eur(line('Enrichissement (cash-flow + capital remboursé)')[y]!),
  ],
  ['Loyers hors charges', (y) => eur(line('Loyers hors charges')[y]!)],
  ['Loyers annualisés', (y) => eur(line('Loyers hors charges annualisés')[y]!)],
  ['Rendement brut', (y) => pct(line('Rendement brut')[y]!)],
  ['Rendement net (avant financement)', (y) => pct(line('Rendement net (avant financement)')[y]!)],
  ['Capital restant dû au 31/12', (y) => eur(line('Capital restant dû au 31/12')[y]!)],
  [
    'Valeur estimée moins capital restant dû',
    (y) => eur(line('Valeur estimée moins capital restant dû')[y]!),
  ],
];

const YEARS = ['2024', '2025', '2026'];

/** Valeur affichée pour un indicateur et une année, selon la mise en page (tableau ou cartes). */
function cell(page: Page, phone: boolean, label: string, year: string): Locator {
  if (phone) {
    return page
      .getByRole('region', { name: `Année ${year}` })
      .locator('.year-lines > div')
      .filter({ has: page.locator('dt').getByText(label, { exact: true }) })
      .locator('dd');
  }
  const column = YEARS.indexOf(year) + 2; // 1re colonne = libellé
  return page
    .locator('table[aria-label="Synthèse annuelle"] tr')
    .filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })
    .locator(`td:nth-child(${column})`);
}

test.beforeEach(async ({ page }) => {
  await startWithTestData(page);
  await goTo(page, 'Synthèse');
  await expect(page.getByRole('heading', { name: 'Synthèse · Appartement exemple' })).toBeVisible();
});

test('les chiffres 2024 à 2026 retombent sur expected.json', async ({ page }, testInfo) => {
  const phone = isPhone(testInfo);
  for (const year of YEARS) {
    for (const [label, value] of CHECKS) {
      await expect(cell(page, phone, label, year), `${label} ${year}`).toHaveText(value(year));
    }
  }
  await capture(page, testInfo, 'us08-synthese');
});

test('la date de mise à jour vaut 25/10/2026 pour le jeu de test', async ({ page }) => {
  await expect(page.getByLabel('Données à jour au')).toHaveValue('2026-10-25');
  await expect(
    page.getByText('2026 : année en cours, chiffres arrêtés au 25/10/2026.'),
  ).toBeVisible();
});

test('changer la date : les années suivantes disparaissent, les échéances sont comptées jusqu’à cette date', async ({
  page,
}, testInfo) => {
  await page.getByLabel('Données à jour au').fill('2025-06-30');
  await expect(
    page.getByText('2025 : année en cours, chiffres arrêtés au 30/06/2025.'),
  ).toBeVisible();
  const phone = isPhone(testInfo);
  if (phone) {
    await expect(page.getByRole('region', { name: /^Année / })).toHaveCount(2);
  } else {
    await expect(page.locator('table[aria-label="Synthèse annuelle"] thead th')).toHaveText([
      'Indicateur',
      '2024',
      '2025',
    ]);
  }
  const paid = seed.echeances_pret
    .filter((e) => e.date >= '2025-01-01' && e.date <= '2025-06-30')
    .reduce((s, e) => s + e.capital + e.interets + e.assurance, 0);
  await expect(cell(page, phone, 'Échéances de prêt (période louée)', '2025')).toHaveText(
    eur(paid),
  );
  await expect(cell(page, phone, 'Mois de location', '2025')).toHaveText('5,95'); // 181 jours / (365 / 12)

  // La date est enregistrée : elle est retrouvée en revenant sur la page.
  await goTo(page, 'Accueil');
  await goTo(page, 'Synthèse');
  await expect(page.getByLabel('Données à jour au')).toHaveValue('2025-06-30');
});

test('la partie fiscale suit la synthèse, avec l’avertissement', async ({ page }) => {
  // Depuis US09 : le récapitulatif LMNP réel (voir e2e/us09-fiscalite-lmnp-reel.spec.ts).
  const tax = page.getByRole('region', { name: 'Résultat fiscal LMNP au réel' });
  await expect(tax).toContainText('pas un conseil fiscal');
  await expect(tax.getByRole('link', { name: 'impots.gouv.fr' })).toBeVisible();
});

test('sur téléphone, la synthèse s’affiche année par année', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), 'téléphone seulement');
  await expect(page.locator('table[aria-label="Synthèse annuelle"]')).toBeHidden();
  const cards = page.getByRole('region', { name: /^Année / });
  await expect(cards).toHaveCount(3);
  // La plus récente en premier.
  await expect(cards.first().getByRole('heading', { level: 3 })).toHaveText('2026');
  await expectNoHorizontalScroll(page);
});

test('sur ordinateur, la synthèse est un tableau, une colonne par année', async ({
  page,
}, testInfo) => {
  test.skip(isPhone(testInfo), 'ordinateur seulement');
  await expect(page.locator('table[aria-label="Synthèse annuelle"]')).toBeVisible();
  await expect(page.getByRole('region', { name: /^Année / }).first()).toBeHidden();
});
