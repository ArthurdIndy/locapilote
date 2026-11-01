/** Recette US09 : récapitulatif LMNP réel, immobilisations, rapprochement avec le comptable. */
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import {
  capture,
  eur,
  expect,
  expected,
  expectNoHorizontalScroll,
  goTo,
  isPhone,
  startWithTestData,
  test,
} from './helpers';

type Line = Record<string, number | null>;
const line = (label: string): Line => (expected.synthese as Record<string, Line>)[label]!;
const YEARS = ['2024', '2025', '2026'];

/** Libellé à l'écran → ligne de expected.json. */
const CHECKS: [string, string][] = [
  ['Loyers', 'Loyers hors charges'],
  ['Charges refacturées', 'Charges refacturées au locataire'],
  ['Autres recettes', 'Autres recettes'],
  ['Total des recettes imposables', 'Total des recettes imposables'],
  ['Assurances', 'Assurances'],
  ['Copropriété', 'Copropriété'],
  ['Entretien et petit équipement', 'Entretien et petit équipement'],
  ['Frais de gestion', 'Frais de gestion (agence, comptable)'],
  ['Impôts et taxes', 'Impôts et taxes'],
  ['Autres charges', 'Autres charges'],
  ['Intérêts d’emprunt (période louée)', "Intérêts d'emprunt (période louée)"],
  ['Assurance emprunteur (période louée)', 'Assurance emprunteur (période louée)'],
  ['Total des charges déductibles', 'Total des charges déductibles'],
  ['Résultat avant amortissements', 'Résultat avant amortissements'],
  ['Dotations aux amortissements de l’année', "Dotations aux amortissements de l'année"],
  ['Amortissements en report (début d’année)', "Amortissements en report (début d'année)"],
  ['Amortissements utilisés', 'Amortissements utilisés'],
  [
    'Amortissements en report (fin d’année, calcul de l’outil)',
    "Amortissements en report (fin d'année, calcul de l'outil)",
  ],
  [
    'Stock reporté retenu par le comptable',
    'Stock reporté retenu par le comptable (comptes déposés)',
  ],
  ['Résultat fiscal estimé', 'Résultat fiscal estimé'],
  ['Dépenses à qualifier (non retenues)', 'Dépenses à qualifier (non retenues)'],
  ['Investissements de l’année (à amortir)', "Investissements de l'année (à amortir)"],
];

const shown = (value: number | null) => (value === null ? 'non saisi' : eur(value));

/** Montant affiché pour une rubrique et une année (tableau sur ordinateur, cartes sur téléphone). */
function cell(page: Page, phone: boolean, label: string, year: string): Locator {
  if (phone) {
    return page
      .getByRole('region', { name: `Fiscalité ${year}` })
      .locator('.year-lines > div')
      .filter({ has: page.locator('dt').getByText(label, { exact: true }) })
      .locator('dd');
  }
  return page
    .locator('table[aria-label="Récapitulatif LMNP réel"] tr')
    .filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })
    .locator(`td:nth-child(${YEARS.indexOf(year) + 2})`);
}

const taxRegion = (page: Page) =>
  page.getByRole('region', { name: 'Résultat fiscal LMNP au réel' });
const reconciliation = (page: Page) =>
  page.getByRole('region', { name: 'Rapprochement avec le comptable' });
const reconciliationLine = (page: Page, label: string) =>
  reconciliation(page).getByRole('listitem', { name: label, exact: true });

async function openTax(page: Page) {
  await goTo(page, 'Fiscalité');
  await expect(
    page.getByRole('heading', { name: 'Fiscalité · Appartement exemple' }),
  ).toBeVisible();
  await expect(taxRegion(page)).toBeVisible();
}

/** « Résultat fiscal estimé » d'une année, dans la Synthèse. */
function synthesisTaxResult(page: Page, phone: boolean, year: string): Locator {
  if (phone) {
    return page
      .getByRole('region', { name: `Année ${year}` })
      .locator('.year-lines > div')
      .filter({ has: page.locator('dt').getByText('Résultat fiscal estimé', { exact: true }) })
      .locator('dd');
  }
  return page
    .locator('table[aria-label="Synthèse annuelle"] tr')
    .filter({ has: page.getByRole('rowheader', { name: 'Résultat fiscal estimé', exact: true }) })
    .locator(`td:nth-child(${YEARS.indexOf(year) + 2})`);
}

test.beforeEach(async ({ page }) => {
  await startWithTestData(page);
});

test('le récapitulatif LMNP réel 2024 à 2026 retombe sur expected.json', async ({
  page,
}, testInfo) => {
  await openTax(page);
  const phone = isPhone(testInfo);
  for (const year of YEARS) {
    for (const [label, key] of CHECKS) {
      await expect(cell(page, phone, label, year), `${label} ${year}`).toHaveText(
        shown(line(key)[year]!),
      );
    }
  }
  await taxRegion(page).scrollIntoViewIfNeeded();
  await capture(page, testInfo, 'us09-recapitulatif');
});

test('chaque écran fiscal porte l’avertissement et renvoie vers impots.gouv.fr', async ({
  page,
}) => {
  await openTax(page);
  await expect(taxRegion(page)).toContainText('pas un conseil fiscal');
  await expect(taxRegion(page)).toContainText('expert-comptable');
  await expect(taxRegion(page).getByRole('link', { name: 'impots.gouv.fr' })).toBeVisible();
  await goTo(page, 'Immobilisations');
  await expect(page.getByText(/pas un conseil fiscal/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'impots.gouv.fr' })).toBeVisible();
});

test('un autre régime affiche « pas encore disponible »', async ({ page }, testInfo) => {
  await goTo(page, 'Biens');
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.getByLabel('Régime fiscal').selectOption({ label: 'LMNP micro-BIC' });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Bien « Appartement exemple » modifié.')).toBeVisible();
  await goTo(page, 'Fiscalité');
  const tax = page.getByRole('region', { name: 'Résultat fiscal', exact: true });
  await expect(tax).toContainText('pas encore disponible pour ce régime (LMNP micro-BIC)');
  await expect(tax.getByRole('link', { name: 'impots.gouv.fr' })).toBeVisible();
  await expect(taxRegion(page)).toHaveCount(0);
  // Dans la Synthèse, la ligne du résultat fiscal affiche « non disponible ».
  await goTo(page, 'Synthèse');
  for (const year of YEARS) {
    await expect(synthesisTaxResult(page, isPhone(testInfo), year)).toHaveText('non disponible');
  }
});

test('les mouvements « À valider » sont signalés, avec un lien vers eux', async ({ page }) => {
  await openTax(page);
  const warning = taxRegion(page).getByText(/2024 : 1 mouvement « À valider »/);
  await expect(warning).toContainText('395,25');
  await expect(warning).toContainText('non retenu dans le résultat fiscal');
  await warning.getByRole('link', { name: 'Voir le mouvement concerné' }).click();
  await expect(page.getByRole('heading', { name: 'Mouvements' })).toBeVisible();
  await expect(page.getByText(/Seuls les mouvements « À valider » sont affichés/)).toBeVisible();
  await expect(page.locator('.transaction')).toHaveCount(1);
  await expect(page.locator('.transaction')).toContainText('À qualifier');
  await expect(page.getByLabel('Année')).toHaveValue('2024');
  await page.getByRole('button', { name: 'Voir tous les mouvements' }).click();
  await expect(page.locator('.transaction')).not.toHaveCount(1);
});

test('immobilisations : liste et dotation de chaque année', async ({ page }, testInfo) => {
  await goTo(page, 'Immobilisations');
  await expect(
    page.getByRole('heading', { name: 'Immobilisations · Appartement exemple' }),
  ).toBeVisible();
  const phone = isPhone(testInfo);
  const dotation = line("Dotations aux amortissements de l'année");
  if (phone) {
    const totals = page.getByRole('region', { name: 'Dotations par année' });
    for (const y of YEARS) {
      await expect(
        totals.locator('.year-lines > div').filter({ hasText: y }).locator('dd'),
      ).toHaveText(eur(dotation[y]!));
    }
    const fridge = page.getByRole('region', { name: 'Réfrigérateur' });
    await expect(fridge).toContainText('10/06/2029');
    await expect(
      fridge.locator('.year-lines > div').filter({ hasText: 'Dotation 2024' }).locator('dd'),
    ).toHaveText(eur(120.28));
  } else {
    const list = page.getByRole('table', { name: 'Liste des immobilisations' });
    await expect(list.getByRole('rowheader')).toHaveCount(5);
    await expect(list.getByRole('row', { name: /Bâtiment/ })).toContainText('17/10/2046');
    const years = page.getByRole('table', { name: 'Dotations par année' });
    await expect(years.getByRole('row', { name: /Total/ }).locator('td')).toHaveText(
      YEARS.map((y) => eur(dotation[y]!)),
    );
    await expect(years.getByRole('row', { name: /Réfrigérateur/ }).locator('td')).toHaveText([
      eur(120.28),
      eur(215.2),
      eur(215.2),
    ]);
  }
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'us09-immobilisations');
});

test('immobilisations : ajout, modification et suppression, répercutés sur le résultat fiscal', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await goTo(page, 'Immobilisations');
  await page.getByRole('button', { name: 'Nouvelle immobilisation' }).click();
  await page.getByLabel('Composant *').fill('Canapé');
  await page.getByLabel('Date de mise en service *').fill('2026-01-01');
  await page.getByLabel('Valeur (€) *').fill('1000');
  await page.getByLabel('Durée (années) *').fill('5');
  await expect(page.getByText('Dotation annuelle : 200,00 €')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter l’immobilisation' }).click();
  await expect(page.getByText('Immobilisation « Canapé » ajoutée.')).toBeVisible();

  // 2026 : 9 388,39 € + 200 € de dotation.
  await goTo(page, 'Fiscalité');
  await expect(cell(page, phone, 'Dotations aux amortissements de l’année', '2026')).toHaveText(
    eur(9588.39),
  );

  await goTo(page, 'Immobilisations');
  await page.getByRole('button', { name: 'Modifier Canapé' }).click();
  await expect(page.getByLabel('Valeur (€) *')).toHaveValue('1000');
  await page.getByLabel('Durée (années) *').fill('0');
  await expect(page.getByText('Non amorti', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Immobilisation « Canapé » modifiée.')).toBeVisible();
  await goTo(page, 'Fiscalité');
  await expect(cell(page, phone, 'Dotations aux amortissements de l’année', '2026')).toHaveText(
    eur(9388.39),
  );

  await goTo(page, 'Immobilisations');
  await page.getByRole('button', { name: 'Supprimer Canapé' }).click();
  await expect(page.getByText('Immobilisation « Canapé » supprimée.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Modifier Canapé' })).toHaveCount(0);
});

test('immobilisation : la saisie est vérifiée', async ({ page }) => {
  await goTo(page, 'Immobilisations');
  await page.getByRole('button', { name: 'Nouvelle immobilisation' }).click();
  await page.getByLabel('Durée (années) *').fill('cinq');
  await page.getByRole('button', { name: 'Ajouter l’immobilisation' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Indique le composant');
  await expect(alert).toContainText('Indique la date de mise en service');
  await expect(alert).toContainText('La durée doit être un nombre d’années');
});

test('rapprochement : les écarts expliqués du jeu de test (contrôles de expected.json)', async ({
  page,
}, testInfo) => {
  await openTax(page);
  const controls = expected.controles.filter((c) => c.statut === 'Écart expliqué');
  for (const control of controls) {
    const year = control.controle.slice(-4);
    await reconciliation(page).getByRole('button', { name: year, exact: true }).click();
    const label = control.controle.startsWith('Recettes')
      ? 'Recettes'
      : 'Charges hors amortissements';
    const row = reconciliationLine(page, label);
    await expect(row.locator('.rl-tool')).toHaveText(eur(control.calcule));
    await expect(row.locator('.rl-accountant')).toHaveText(eur(control.attendu));
    const gap = control.calcule - control.attendu;
    await expect(row.locator('.rl-gap')).toHaveText(`${gap > 0 ? '+' : ''}${eur(gap)}`);
    await expect(row.locator('.rl-status')).toHaveText('Écart expliqué');
    await expect(row.locator('.rl-comment')).not.toBeEmpty();
  }
  // Résultat déposé : 0 € en 2024 et 2025, comme l'outil. Stock reporté : écart expliqué.
  for (const year of ['2024', '2025']) {
    await reconciliation(page).getByRole('button', { name: year, exact: true }).click();
    const result = reconciliationLine(page, 'Résultat fiscal');
    await expect(result.locator('.rl-accountant')).toHaveText(eur(0));
    await expect(result.locator('.rl-status')).toHaveText('OK');
    const stock = reconciliationLine(page, 'Stock d’amortissements reporté (fin d’année)');
    await expect(stock.locator('.rl-status')).toHaveText('Écart expliqué');
    await expect(stock.locator('.rl-comment')).toContainText('a donc utilisé plus d');
  }
  // Dotations : identiques aux comptes déposés.
  await expect(
    reconciliationLine(page, 'Dotations aux amortissements').locator('.rl-status'),
  ).toHaveText('OK');
  await reconciliation(page).scrollIntoViewIfNeeded();
  await capture(page, testInfo, 'us09-rapprochement');
});

test('rapprochement : saisir les comptes, un écart sans explication est « à expliquer »', async ({
  page,
}) => {
  await openTax(page);
  await reconciliation(page).getByRole('button', { name: '2026', exact: true }).click();
  await expect(reconciliationLine(page, 'Recettes').locator('.rl-status')).toHaveText('Non saisi');
  await reconciliation(page).getByRole('button', { name: 'Saisir les comptes 2026' }).click();
  const form = page.getByRole('form', { name: 'Comptes déposés 2026' });
  const income = form.getByRole('group', { name: 'Recettes' });
  await income.getByLabel('Recettes (€)').fill('11000');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Comptes 2026 enregistrés.')).toBeVisible();
  const row = reconciliationLine(page, 'Recettes');
  await expect(row.locator('.rl-gap')).toHaveText(`+${eur(432.62)}`);
  await expect(row.locator('.rl-status')).toHaveText('À expliquer');

  await reconciliation(page).getByRole('button', { name: 'Modifier les comptes 2026' }).click();
  await income.getByLabel('Explication de l’écart').fill('Loyer de novembre non retenu');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(row.locator('.rl-status')).toHaveText('Écart expliqué');
  await expect(row.locator('.rl-comment')).toHaveText('Loyer de novembre non retenu');
});

test('le stock reporté du comptable se saisit depuis le récapitulatif et fait foi l’année suivante', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await openTax(page);
  await reconciliation(page).getByRole('button', { name: '2025', exact: true }).click();
  await reconciliation(page).getByRole('button', { name: 'Modifier les comptes 2025' }).click();
  const stock = page
    .getByRole('form', { name: 'Comptes déposés 2025' })
    .getByRole('group', { name: 'Stock d’amortissements reporté' });
  await expect(stock.getByLabel('Stock d’amortissements reporté (€)')).toHaveValue('3824,30');
  await stock.getByLabel('Stock d’amortissements reporté (€)').fill('4000');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(cell(page, phone, 'Stock reporté retenu par le comptable', '2025')).toHaveText(
    eur(4000),
  );
  await expect(cell(page, phone, 'Amortissements en report (début d’année)', '2026')).toHaveText(
    eur(4000),
  );

  // Effacé : on reprend le report calculé par l'outil (4 449,23 €).
  await reconciliation(page).getByRole('button', { name: 'Modifier les comptes 2025' }).click();
  await stock.getByLabel('Stock d’amortissements reporté (€)').fill('');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(cell(page, phone, 'Stock reporté retenu par le comptable', '2025')).toHaveText(
    'non saisi',
  );
  await expect(cell(page, phone, 'Amortissements en report (début d’année)', '2026')).toHaveText(
    eur(4449.23),
  );
});

test('export CSV du récapitulatif, à envoyer au comptable', async ({ page }) => {
  await openTax(page);
  const download = page.waitForEvent('download');
  await taxRegion(page).getByRole('button', { name: 'Exporter en CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('locapilote-recapitulatif-lmnp-Appartement-exemple.csv');
  const csv = readFileSync((await file.path())!, 'utf8');
  expect(csv).toContain('Rubrique;2024;2025;2026');
  expect(csv).toContain('Total des recettes imposables;8366,76;13703,15;11432,62');
  expect(csv).toContain('Résultat fiscal estimé;0,00;0,00;0,00');
});

test('version imprimable : seul le récapitulatif est imprimé', async ({ page }, testInfo) => {
  await openTax(page);
  // On remplace la boîte de dialogue d'impression par un simple marqueur.
  await page.evaluate(() => {
    window.print = () => document.body.setAttribute('data-printed', 'oui');
  });
  await taxRegion(page).getByRole('button', { name: 'Version imprimable' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'oui');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeHidden();
  await expect(page.locator('table[aria-label="Synthèse annuelle"]')).toBeHidden();
  await expect(page.locator('table[aria-label="Récapitulatif LMNP réel"]')).toBeVisible();
  await expect(
    taxRegion(page).getByText('Appartement exemple · données à jour au 25/10/2026'),
  ).toBeVisible();
  await expect(taxRegion(page).getByRole('button', { name: 'Exporter en CSV' })).toBeHidden();
  await capture(page, testInfo, 'us09-impression');
});

test('sur téléphone, le récapitulatif s’affiche année par année, sans défilement horizontal', async ({
  page,
}, testInfo) => {
  test.skip(!isPhone(testInfo), 'téléphone seulement');
  await openTax(page);
  const cards = page.getByRole('region', { name: /^Fiscalité / });
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByRole('heading', { level: 3 })).toHaveText('2026');
  await expectNoHorizontalScroll(page);
});

test('la Synthèse ne garde que le résultat fiscal estimé, avec un lien vers le détail', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await goTo(page, 'Synthèse');
  for (const year of YEARS) {
    await expect(synthesisTaxResult(page, phone, year)).toHaveText(
      eur(line('Résultat fiscal estimé')[year]!),
    );
  }
  // Le détail (récapitulatif, rapprochement, export) n'est plus sur la Synthèse.
  await expect(taxRegion(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Rapprochement avec le comptable' })).toHaveCount(
    0,
  );
  await capture(page, testInfo, 'us09-synthese');
  await page.getByRole('link', { name: 'Voir le détail fiscal' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Fiscalité · Appartement exemple' }),
  ).toBeVisible();
  await expect(taxRegion(page)).toBeVisible();
});

test('« Données à jour au » : une ligne en haut de page, même date en Synthèse et en Fiscalité', async ({
  page,
}) => {
  await goTo(page, 'Synthèse');
  const date = page.getByLabel('Données à jour au');
  await expect(date).toHaveValue('2026-10-25');
  await date.fill('2025-12-31');
  await goTo(page, 'Fiscalité');
  await expect(page.getByLabel('Données à jour au')).toHaveValue('2025-12-31');
  // Les années suivantes disparaissent aussi du récapitulatif fiscal.
  await expect(page.locator('table[aria-label="Récapitulatif LMNP réel"] thead th')).toHaveText([
    'Rubrique',
    '2024',
    '2025',
  ]);
  await page.getByLabel('Données à jour au').fill('2026-10-25');
  await goTo(page, 'Synthèse');
  await expect(page.getByLabel('Données à jour au')).toHaveValue('2026-10-25');
});

test('menu : 8 onglets, utilisables sur téléphone (une ligne qui défile)', async ({
  page,
}, testInfo) => {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link')).toHaveText([
    'Accueil',
    'Biens',
    'Mouvements',
    'Prêt',
    'Immobilisations',
    'Synthèse',
    'Fiscalité',
    'Données',
  ]);
  // Une seule ligne d'onglets, sur ordinateur comme sur téléphone.
  const box = await nav.boundingBox();
  expect(box!.height).toBeLessThan(60);
  for (const [label, heading] of [
    ['Données', /^Données/],
    ['Accueil', /Appartement exemple/],
    ['Fiscalité', /^Fiscalité/],
  ] as const) {
    await goTo(page, label);
    await expect(page.getByRole('heading', { level: 2, name: heading }).first()).toBeVisible();
    // L'onglet actif est visible à l'écran, sans défilement manuel.
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveText(label);
    await expect(active).toBeInViewport({ ratio: 1 });
  }
  await expectNoHorizontalScroll(page);
  if (isPhone(testInfo)) await capture(page, testInfo, 'us09-menu');
});
