/**
 * Recette de l'itération 3 bis, étape 3 : deux finitions (docs/backlog.md, lignes « Mois de
 * location : décimales » et « Assurance emprunteur variable »).
 */
import {
  capture,
  expect,
  expected,
  goTo,
  goToProperty,
  isPhone,
  months,
  startWithTestData,
  test,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await startWithTestData(page);
});

test('mois de location : toujours deux décimales', async ({ page }, testInfo) => {
  await goTo(page, 'Synthèse');
  const target = (expected.synthese as unknown as Record<string, Record<string, number>>)[
    'Mois de location sur la période'
  ]!;
  const values = ['2024', '2025', '2026'].map((y) => months(target[y]!));
  expect(values).toEqual(['7,50', '12,00', '9,99']);
  if (isPhone(testInfo)) {
    for (const [i, year] of ['2024', '2025', '2026'].entries()) {
      await expect(
        page
          .getByRole('region', { name: `Année ${year}` })
          .locator('.year-lines > div')
          .filter({ has: page.locator('dt', { hasText: /^Mois de location$/ }) })
          .locator('dd'),
      ).toHaveText(values[i]!);
    }
  } else {
    await expect(
      page
        .locator('table[aria-label="Synthèse annuelle"] tr')
        .filter({ has: page.getByRole('rowheader', { name: 'Mois de location', exact: true }) })
        .locator('td'),
    ).toHaveText(values);
  }
});

test('prêt : assurance actuelle et changement en cours de prêt (décembre 2032)', async ({
  page,
}, testInfo) => {
  await goToProperty(page, 'Prêt');
  const card = page.getByRole('region', { name: 'Prêt BANQUE' });
  await expect(card).toContainText('assurance actuelle 20,08 € / mois');
  await expect(card).not.toContainText('assurance 20,08');
  const change = card.locator('.insurance-change');
  await expect(change).toContainText('L’assurance change en cours de prêt');
  await expect(change).toContainText(
    '11,27 € / mois à partir de décembre 2032 (échéance du 05/12/2032)',
  );
  await capture(page, testInfo, 'it3bis-pret-assurance');
});
