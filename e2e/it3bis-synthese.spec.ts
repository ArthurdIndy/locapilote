/**
 * Recette de l'itération 3 bis, étape 2 : synthèse avec détails repliés (docs/backlog.md,
 * « Synthèse : détail des recettes et des dépenses »).
 */
import type { Locator, Page } from '@playwright/test';
import {
  capture,
  eur,
  expect,
  expected,
  expectNoHorizontalScroll,
  goTo,
  isPhone,
  openDetail,
  parseEur,
  startWithTestData,
  test,
} from './helpers';

const YEARS = ['2024', '2025', '2026'];

type Line = Record<string, number | null>;
const line = (label: string): Line => (expected.synthese as Record<string, Line>)[label]!;

const INCOME_GROUPS = ['Loyers', 'Charges refacturées', 'Autres recettes'];
/** Groupes de dépenses : ordre alphabétique, « Autres… », puis investissements et à qualifier. */
const EXPENSE_GROUPS = [
  'Assurances',
  'Copropriété',
  'Entretien et petit équipement',
  'Frais de gestion',
  'Impôts et taxes',
  'Autres charges',
  'À qualifier',
  'Investissements',
];

/** Lignes d'une année : sur ordinateur, une colonne du tableau ; sur téléphone, la carte. */
function yearRows(page: Page, phone: boolean, year: string) {
  if (phone) {
    const card = page.getByRole('region', { name: `Année ${year}` });
    return {
      label: (row: Locator) => row.locator('dt'),
      rows: card.locator('.year-lines > div'),
      value: (row: Locator) => row.locator('dd'),
    };
  }
  const column = YEARS.indexOf(year) + 2;
  return {
    label: (row: Locator) => row.locator('th'),
    rows: page.locator('table[aria-label="Synthèse annuelle"] tbody tr:not(.section-row)'),
    value: (row: Locator) => row.locator(`td:nth-child(${column})`),
  };
}

/** Libellés et valeurs affichés pour une année, dans l'ordre. */
async function readYear(page: Page, phone: boolean, year: string) {
  const { rows, label, value } = yearRows(page, phone, year);
  const result: { label: string; value: string; detail: boolean }[] = [];
  for (const row of await rows.all()) {
    result.push({
      label: (await label(row).innerText()).replace(/[⊕⊖]/g, '').trim(),
      value: (await value(row).innerText()).trim(),
      detail: ((await row.getAttribute('class')) ?? '').includes('detail'),
    });
  }
  return result;
}

/** Lignes de détail qui suivent une ligne donnée. */
function detailsAfter(lines: Awaited<ReturnType<typeof readYear>>, label: string) {
  const index = lines.findIndex((l) => l.label === label && !l.detail);
  const details = [];
  for (let i = index + 1; i < lines.length && lines[i]!.detail; i++) details.push(lines[i]!);
  return { total: lines[index]!, details };
}

test.beforeEach(async ({ page }) => {
  await startWithTestData(page);
  await goTo(page, 'Synthèse');
  await expect(page.getByRole('heading', { name: 'Synthèse · Appartement exemple' })).toBeVisible();
});

test('détails fermés par défaut ; restent visibles les lignes principales', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  for (const label of [
    'Recettes encaissées',
    'Dépenses payées (hors prêt)',
    'Échéances de prêt (période louée)',
    'Rendement brut',
  ]) {
    const buttons = page.getByRole('button', { name: label, exact: true });
    await expect(buttons.filter({ visible: true }).first()).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }
  const lines = await readYear(page, phone, '2025');
  expect(lines.filter((l) => l.detail)).toEqual([]);
  expect(lines.map((l) => l.label)).toEqual([
    'Recettes encaissées',
    'Dépenses payées (hors prêt)',
    'Échéances de prêt (période louée)',
    'Cash-flow',
    'Mois de location',
    'Cash-flow mensuel moyen',
    'Capital remboursé',
    'Enrichissement (cash-flow + capital remboursé)',
    'Charges de copropriété restant à ma charge',
    'Rendement brut',
    'Rendement net (avant financement)',
    'Capital restant dû au 31/12',
    'Valeur estimée moins capital restant dû',
    'Résultat fiscal estimé',
  ]);
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'it3bis-synthese-fermee');
});

test('recettes, dépenses, échéances : la somme des détails égale le total, chaque année', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await openDetail(page, 'Recettes encaissées');
  await openDetail(page, 'Dépenses payées (hors prêt)');
  await openDetail(page, 'Échéances de prêt (période louée)');
  await openDetail(page, 'Rendement brut');
  for (const year of YEARS) {
    const lines = await readYear(page, phone, year);
    for (const [label, groups] of [
      ['Recettes encaissées', INCOME_GROUPS],
      ['Dépenses payées (hors prêt)', EXPENSE_GROUPS],
      ['Échéances de prêt (période louée)', ['dont capital', 'dont intérêts', 'dont assurance']],
      ['Rendement brut', ['Loyers hors charges', 'Loyers annualisés']],
    ] as const) {
      const { total, details } = detailsAfter(lines, label);
      expect(
        details.map((d) => d.label),
        `${label} ${year}`,
      ).toEqual(groups);
      if (label === 'Rendement brut') continue;
      const sum = details.reduce((s, d) => s + parseEur(d.value), 0);
      expect(Math.round(sum * 100), `${label} ${year}`).toBe(
        Math.round(parseEur(total.value) * 100),
      );
    }
    // Les loyers du détail retombent sur expected.json.
    const { details } = detailsAfter(lines, 'Rendement brut');
    expect(details[0]!.value).toBe(eur(line('Loyers hors charges')[year]!));
    expect(details[1]!.value).toBe(eur(line('Loyers hors charges annualisés')[year]!));
  }
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'it3bis-synthese-detail');
});

test('charges de copropriété restant à ma charge = copropriété − charges refacturées', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await openDetail(page, 'Recettes encaissées');
  await openDetail(page, 'Dépenses payées (hors prêt)');
  const expectedValues: Record<string, string> = {
    '2024': eur(503.13),
    '2025': eur(1111.51),
    '2026': eur(2870.9),
  };
  for (const year of YEARS) {
    const lines = await readYear(page, phone, year);
    const value = (label: string) => parseEur(lines.find((l) => l.label === label)!.value);
    const borne = lines.find((l) => l.label === 'Charges de copropriété restant à ma charge')!;
    expect(borne.value).toBe(expectedValues[year]);
    expect(Math.round(parseEur(borne.value) * 100)).toBe(
      Math.round((value('Copropriété') - value('Charges refacturées')) * 100),
    );
  }
});

test('l’état ouvert ou fermé est mémorisé dans le navigateur', async ({ page }) => {
  await openDetail(page, 'Dépenses payées (hors prêt)');
  await page.reload();
  const expenses = page
    .getByRole('button', { name: 'Dépenses payées (hors prêt)', exact: true })
    .filter({ visible: true })
    .first();
  await expect(expenses).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page
      .getByRole('button', { name: 'Recettes encaissées', exact: true })
      .filter({ visible: true })
      .first(),
  ).toHaveAttribute('aria-expanded', 'false');
  // On referme : fermé après rechargement aussi.
  await expenses.click();
  await page.reload();
  await expect(expenses).toHaveAttribute('aria-expanded', 'false');
});

test('un clic sur une ligne de détail ouvre Mouvements filtré sur ce groupe et cette année', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await openDetail(page, 'Dépenses payées (hors prêt)');
  const group = 'Entretien et petit équipement';
  const amount = eur(386.42);
  if (phone) {
    const row = page
      .getByRole('region', { name: 'Année 2025' })
      .locator('.year-lines > div.detail')
      .filter({ hasText: group });
    await expect(row.locator('dd')).toHaveText(amount);
    await row.getByRole('link', { name: group }).click();
  } else {
    await page.getByRole('link', { name: `${group} 2025 : ${amount}` }).click();
  }
  await expect(page.getByRole('heading', { name: 'Mouvements' })).toBeVisible();
  const filters = page.getByRole('region', { name: 'Filtres' });
  await expect(filters.getByLabel('Année')).toHaveValue('2025');
  await expect(filters.getByLabel('Groupe')).toHaveValue(group);
  await expect(page.getByText(/^\d+ mouvements? · recettes/)).toContainText(`dépenses ${amount}`);
  const categories = await page.locator('.transaction strong').allInnerTexts();
  expect(new Set(categories)).toEqual(
    new Set(categories.filter((c) => ['Entretien et réparations', 'Petit équipement'].includes(c))),
  );
  await capture(page, testInfo, 'it3bis-mouvements-filtres');
});
