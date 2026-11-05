/**
 * Recette US12 (version légère) : Budget du bien courant, une ligne par groupe, colonnes
 * « N−1 réel | N prévu | N estimé fin d'année | Écart / prévu », ✎ pour corriger un prévu, détail
 * ⊕ sur ordinateur, une carte par ligne sur téléphone ; lien avec la simulation de vente.
 * Jeu de test : données au 25/10/2026.
 */
import type { Locator, Page } from '@playwright/test';
import {
  capture,
  createProperty,
  expect,
  expectNoHorizontalScroll,
  goTo,
  isPhone,
  startEmpty,
  startWithTestData,
  test,
} from './helpers';

const euroRounded = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
/** Montant arrondi à l'euro : 13703.15 → « 13 703 € ». */
const eur0 = (value: number) => euroRounded.format(Math.round(value));
/** Écart signé : 1622.31 → « +1 622 € », −12.54 → « −13 € », 0 → « 0 € ». */
const gap0 = (value: number) => {
  const r = Math.round(value);
  if (r === 0) return eur0(0);
  return r > 0 ? `+${eur0(r)}` : `−${eur0(-r)}`;
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COLUMNS_2026 = ['2025 réel', '2026 prévu', '2026 estimé fin d’année', 'Écart / prévu'];

/** Valeur d'une ligne : colonne `column` du tableau (ordinateur) ou de la carte (téléphone). */
function cell(page: Page, phone: boolean, year: number, row: string, column: string): Locator {
  if (phone) {
    return page
      .getByRole('region', { name: row, exact: true })
      .locator('.year-lines > div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${escapeRegExp(column)}$`) }) })
      .locator('dd');
  }
  const table = page.locator(`table[aria-label="Budget ${year}"]`);
  return table
    .locator('tbody tr')
    .filter({
      has: page.locator('th[scope="row"]', { hasText: new RegExp(`^${escapeRegExp(row)}`) }),
    })
    .first()
    .locator('td')
    .nth(columnIndex(year, column));
}

function columnIndex(year: number, column: string): number {
  const headers = [`${year - 1} réel`, `${year - 1} estimé`, `${year} prévu`];
  if (headers.slice(0, 2).includes(column)) return 0;
  if (column === `${year} prévu`) return 1;
  if (column === 'Écart / prévu') return 3;
  return 2;
}

async function goToBudget(page: Page): Promise<void> {
  await goTo(page, 'Budget');
  await expect(page.getByRole('heading', { name: 'Budget · Appartement exemple' })).toBeVisible();
}

/** Lignes du Budget 2026 du jeu de test au 25/10/2026 : 2025 réel, prévu, estimé, écart. */
const BUDGET_2026: [string, number, number, number, number][] = [
  ['Loyers et charges perçus', 13703.15, 13908.7, 13959.28, 50.58],
  ['Copropriété', 2426.77, 2463.17, 4085.48, 1622.31],
  ['Gestion et comptable', 1552.24, 1575.52, 1562.98, -12.54],
  ['Impôts et taxes', 561.72, 570.15, 885.36, 315.21],
  ['Assurances et entretien', 500.6, 508.11, 1257.56, 749.45],
  ['Autres dépenses', 1649.41, 0, 29.96, 29.96],
  ['Prêt (échéances)', 10095.91, 10095.9, 10095.9, 0],
  ['À sortir de ta poche', 3083.5, 1304.15, 3957.96, 2653.81],
];

test('Budget 2026 du jeu de test : une ligne par groupe, quatre colonnes', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToBudget(page);
  await expect(page.getByLabel('Année du budget')).toHaveValue('2026');
  if (phone) {
    // Une carte par ligne, « À sortir de ta poche » en premier.
    const cards = page.locator('.budget-card h3');
    await expect(cards).toHaveText([
      'À sortir de ta poche',
      ...BUDGET_2026.slice(0, -1).map(([label]) => label),
    ]);
    // Pas de détail ⊕ sur téléphone.
    await expect(
      page.locator('.synthesis-narrow').getByRole('button', { name: 'Copropriété', exact: true }),
    ).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  } else {
    const table = page.locator('table[aria-label="Budget 2026"]');
    await expect(table.locator('thead th[scope="col"]:not(:first-child)')).toHaveText(COLUMNS_2026);
    await expect(table.locator('tbody th[scope="row"]')).toHaveText(
      BUDGET_2026.map(([label]) => new RegExp(`^${escapeRegExp(label)}`)),
    );
    await expect(table.locator('tr.strong th')).toHaveText('À sortir de ta poche');
  }
  for (const [row, previous, planned, estimate, gap] of BUDGET_2026) {
    const values = [eur0(previous), eur0(planned), eur0(estimate), gap0(gap)];
    for (const [i, column] of COLUMNS_2026.entries()) {
      await expect(cell(page, phone, 2026, row, column)).toHaveText(values[i]!);
    }
  }
  // Couleur selon l'effet : dépense en plus en rouge, en moins en vert, loyer en plus en vert.
  await expect(cell(page, phone, 2026, 'Copropriété', 'Écart / prévu')).toHaveClass(/negative/);
  await expect(cell(page, phone, 2026, 'Gestion et comptable', 'Écart / prévu')).toHaveClass(
    /positive/,
  );
  await expect(cell(page, phone, 2026, 'Loyers et charges perçus', 'Écart / prévu')).toHaveClass(
    /positive/,
  );
  await expect(cell(page, phone, 2026, 'Prêt (échéances)', 'Écart / prévu')).toHaveClass(
    /gap-zero/,
  );
  await expect(
    page.getByText(
      'Prévu : année précédente + 1,5 %, sauf lignes modifiées. Estimé fin d’année : payé à ce jour + ce qui reste prévu.',
    ),
  ).toBeVisible();
  // Prêt et total : pas de ✎.
  await expect(
    page.getByRole('button', { name: 'Modifier le prévu : Prêt (échéances)' }),
  ).toHaveCount(0);
  await capture(page, testInfo, 'us12-budget-2026');
});

test('sélecteur d’année : année terminée et année future', async ({ page }, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToBudget(page);
  const select = page.getByLabel('Année du budget');
  await expect(select.locator('option')).toHaveText([
    'Budget 2024',
    'Budget 2025',
    'Budget 2026',
    'Budget 2027',
  ]);

  // 2025, année terminée : bilan définitif ; 2024 ramené à 12 mois (loué depuis le 18/05/2024).
  await select.selectOption('2025');
  const past = ['2024 réel', '2025 prévu', '2025 réel', 'Écart / prévu'];
  if (!phone) {
    const head = page.locator(
      'table[aria-label="Budget 2025"] thead th[scope="col"]:not(:first-child)',
    );
    await expect(head).toHaveText(past);
    await expect(head.filter({ hasText: '2024 réel' })).toHaveAttribute(
      'title',
      'Ramené à 12 mois : location commencée le 18/05/2024.',
    );
  }
  const income = [13394.16, 13595.07, 13703.15, 108.08];
  for (const [i, column] of past.entries()) {
    await expect(cell(page, phone, 2025, 'Loyers et charges perçus', column)).toHaveText(
      i === 3 ? gap0(income[i]!) : eur0(income[i]!),
    );
  }
  await expect(page.getByText(/Estimé fin d’année/)).toHaveCount(0);
  await capture(page, testInfo, 'us12-budget-2025');

  // 2027, année future : « 2026 estimé » et « 2027 prévu » seulement.
  await select.selectOption('2027');
  if (phone) {
    await expect(
      page.getByRole('region', { name: 'Copropriété', exact: true }).locator('dt'),
    ).toHaveText(['2026 estimé', '2027 prévu']);
  } else {
    await expect(
      page.locator('table[aria-label="Budget 2027"] thead th[scope="col"]:not(:first-child)'),
    ).toHaveText(['2026 estimé', '2027 prévu']);
  }
  await expect(cell(page, phone, 2027, 'Copropriété', '2026 estimé')).toHaveText(eur0(4085.48));
  await expect(cell(page, phone, 2027, 'Copropriété', '2027 prévu')).toHaveText(eur0(4146.76));
  await capture(page, testInfo, 'us12-budget-2027');
});

test('✎ : corriger un prévu, « modifié », enregistré par année, retour au calcul', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToBudget(page);
  const copro = (column: string) => cell(page, phone, 2026, 'Copropriété', column);

  // Budget de copropriété voté en AG : 3 000 €.
  await page.getByRole('button', { name: 'Modifier le prévu : Copropriété' }).click();
  const input = page.getByLabel('Prévu 2026 : Copropriété (€)').filter({ visible: true });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('2463,17');
  await input.fill('3000');
  await input.press('Enter');
  await expect(copro('2026 prévu')).toContainText(eur0(3000));
  await expect(copro('2026 prévu')).toContainText('modifié');
  // Estimé : 3 791,60 payés + 2025 sur la même période restante (289,54 €) × 3 000 / 2 426,77
  // = 4 149,53 €.
  await expect(copro('2026 estimé fin d’année')).toHaveText(eur0(4149.53));
  await expect(copro('Écart / prévu')).toHaveText(gap0(1149.53));
  await expect(cell(page, phone, 2026, 'À sortir de ta poche', '2026 prévu')).toHaveText(
    eur0(1304.15 - 2463.17 + 3000),
  );
  await capture(page, testInfo, 'us12-budget-modifie');

  // Enregistré : il reste au rechargement ; 2025 ne bouge pas.
  await page.reload();
  await expect(copro('2026 prévu')).toContainText(eur0(3000));
  await page.getByLabel('Année du budget').selectOption('2025');
  await expect(cell(page, phone, 2025, 'Copropriété', '2025 prévu')).toHaveText(eur0(1913.46));
  await page.getByLabel('Année du budget').selectOption('2026');

  // Échap annule une saisie en cours.
  await page.getByRole('button', { name: 'Modifier le prévu : Copropriété' }).click();
  await page.getByLabel('Prévu 2026 : Copropriété (€)').filter({ visible: true }).fill('5000');
  await page.getByLabel('Prévu 2026 : Copropriété (€)').filter({ visible: true }).press('Escape');
  await expect(copro('2026 prévu')).toContainText(eur0(3000));

  await page.getByRole('button', { name: /^Revenir au calcul automatique : Copropriété/ }).click();
  await expect(copro('2026 prévu')).toHaveText(eur0(2463.17));
  await expect(copro('Écart / prévu')).toHaveText(gap0(1622.31));
});

test('détail ⊕ d’une ligne : « Au 25/10 », puis les opérations de la ligne et de l’année', async ({
  page,
}, testInfo) => {
  test.skip(isPhone(testInfo), 'Pas de détail ⊕ sur téléphone.');
  await startWithTestData(page);
  await goToBudget(page);
  const button = page.getByRole('button', { name: 'Copropriété', exact: true });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();
  const table = page.locator('table[aria-label="Budget 2026"]');
  const detail = table.locator('tr.detail');
  await expect(detail).toHaveCount(2);
  // N−1 à la même date dans « 2025 réel », payé à ce jour dans « estimé fin d'année ».
  await expect(detail.nth(0).locator('th')).toHaveText('Au 25/10');
  await expect(detail.nth(0).locator('td')).toHaveText([eur0(2137.23), '', eur0(3791.6), '']);
  await capture(page, testInfo, 'us12-budget-detail');

  await detail.nth(1).getByRole('link', { name: 'Voir les opérations 2026 ›' }).click();
  await expect(page).toHaveURL(/#\/operations\?bien=APPART-01&annee=2026&budget=copropriete$/);
  await expect(page.getByText('Ligne « Copropriété » du budget.')).toBeVisible();
  const amounts = page.locator('.transaction strong');
  await expect(amounts.first()).toBeVisible();
  for (const name of await amounts.allTextContents()) expect(name).toBe('Charges de copropriété');
  await expect(page.getByText(/dépenses 3\s791,60\s€/)).toBeVisible();
  await capture(page, testInfo, 'us12-budget-operations');
});

test('lien avec la simulation de vente : projection d’après le budget 2026', async ({
  page,
}, testInfo) => {
  await startWithTestData(page);
  await goTo(page, 'Simulations');
  const settings = page.getByRole('region', { name: 'Paramètres de vente' });
  await settings.getByRole('button', { name: 'Paramètres de vente' }).click();
  // Le jeu de test garde ses valeurs modifiées ; on revient au calcul automatique.
  for (const label of ['Loyer net projeté (€ / mois)', 'Dépenses projetées (€ / an, hors prêt)']) {
    await settings
      .getByRole('button', { name: `Revenir au calcul automatique : ${label}` })
      .click();
  }
  // (13 908,70 − 1 575,52) / 12 = 1 027,77 €/mois ; 2 463,17 + 570,15 + 508,11 = 3 541,43 €/an.
  await expect(page.getByTestId('resume-parametres')).toContainText(
    /loyer net projeté 1\s027,77\s€\/mois · dépenses projetées 3\s541,43\s€\/an \(d’après le budget 2026\)/,
  );
  await capture(page, testInfo, 'us12-vente-d-apres-budget');

  // Un prévu corrigé dans le budget change la projection de la vente.
  await goToBudget(page);
  await page.getByRole('button', { name: 'Modifier le prévu : Impôts et taxes' }).click();
  await page.getByLabel('Prévu 2026 : Impôts et taxes (€)').filter({ visible: true }).fill('1000');
  await page
    .getByLabel('Prévu 2026 : Impôts et taxes (€)')
    .filter({ visible: true })
    .press('Enter');
  await goTo(page, 'Simulations');
  await expect(page.getByTestId('resume-parametres')).toContainText(
    /dépenses projetées 3\s971,28\s€\/an \(d’après le budget 2026\)/,
  );
});

test('bien sans date de mise en location : invitation à la saisir', async ({ page }) => {
  await startEmpty(page);
  await createProperty(page, 'Studio des tests');
  await goTo(page, 'Budget');
  await expect(page.getByText(/Indique la date de mise en location du bien/)).toBeVisible();
});
