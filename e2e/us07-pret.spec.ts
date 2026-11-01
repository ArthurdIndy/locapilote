/** Recette US07 : prêt et tableau d'amortissement. */
import {
  bankTableAsPasted,
  capture,
  expect,
  expectNoHorizontalScroll,
  goTo,
  goToProperty,
  startEmpty,
  startWithTestData,
  test,
  createProperty,
} from './helpers';
import type { Page } from '@playwright/test';

/** Crée un bien vide puis le prêt du jeu de test, sans échéancier. */
async function createTestLoan(page: Page): Promise<void> {
  await startEmpty(page);
  await createProperty(page, 'Bien avec prêt', { rentalStart: '2024-05-18' });
  await goToProperty(page, 'Prêt');
  await page.getByRole('button', { name: 'Ajouter un prêt' }).click();
  await page.getByLabel('Banque *').fill('Banque test');
  await page.getByLabel('Montant emprunté (€) *').fill('170 190');
  await page.getByLabel('Taux annuel (%) *').fill('1,5');
  await page.getByLabel('Durée (mois) *').fill('240');
  await page.getByLabel('Assurance mensuelle (€)').fill('20,08');
  await page.getByLabel('Première échéance *').fill('2017-12-05');
  await expect(page.getByText('soit 20 ans')).toBeVisible();
  await expect(page.getByText('05/11/2037')).toBeVisible();
  await page.getByRole('button', { name: 'Créer le prêt' }).click();
  await expect(page.getByText(/^Prêt créé/)).toBeVisible();
}

test('créer un prêt rattaché au bien : banque, montant, taux, durée, dates, assurance', async ({
  page,
}, testInfo) => {
  await createTestLoan(page);
  const card = page.getByRole('region', { name: 'Prêt Banque test' });
  await expect(card).toContainText(
    '170 190,00 € à 1,50 % sur 240 mois, du 05/12/2017 au 05/11/2037',
  );
  await expect(card).toContainText('assurance 20,08 € / mois');
  await expect(card.getByText('Pas d’échéancier')).toBeVisible();
  await capture(page, testInfo, 'us07-pret-cree');
});

test('refuse un prêt incomplet', async ({ page }) => {
  await startEmpty(page);
  await createProperty(page, 'Bien');
  await goToProperty(page, 'Prêt');
  await page.getByRole('button', { name: 'Ajouter un prêt' }).click();
  await page.getByRole('button', { name: 'Créer le prêt' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Indique la banque.');
  await expect(alert).toContainText('Montant emprunté invalide');
  await expect(alert).toContainText('Indique la date de la première échéance.');
});

test('charger le tableau de la banque par copier-coller depuis Excel', async ({
  page,
}, testInfo) => {
  await createTestLoan(page);
  await page.getByRole('button', { name: 'Charger le tableau de la banque' }).click();
  await page.getByLabel('Tableau collé').fill(bankTableAsPasted());
  const preview = page.getByRole('status').filter({ hasText: 'échéances du' });
  await expect(preview).toContainText('240 échéances du 05/12/2017 au 05/11/2037');
  await expect(preview).toContainText('Ligne ignorée (sans date) : 1');
  await capture(page, testInfo, 'us07-copier-coller');
  await page.getByRole('button', { name: 'Enregistrer les 240 échéances' }).click();
  await expect(page.getByText('Tableau de la banque enregistré : 240 échéances.')).toBeVisible();
  await expect(page.getByText('Tableau de la banque', { exact: true })).toBeVisible();

  // Par année : 2025, toute l'année en période louée (mêmes chiffres que la synthèse).
  const y2025 = page.getByRole('row', { name: /^2025/ });
  await expect(y2025).toContainText('8 176,19 €');
  await expect(y2025).toContainText('1 678,76 €');
  await expect(y2025).toContainText('240,96 €');
  await expect(y2025).toContainText('107 478,74 €');
});

test('charger le tableau de la banque par un fichier CSV', async ({ page }) => {
  await createTestLoan(page);
  await page.getByRole('button', { name: 'Charger le tableau de la banque' }).click();
  const csv = bankTableAsPasted().replaceAll('\t', ';');
  await page.getByLabel('ou un fichier CSV').setInputFiles({
    name: 'tableau.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText('240 échéances du 05/12/2017 au 05/11/2037')).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer les 240 échéances' }).click();
  await expect(page.getByRole('row', { name: /^2017/ })).toContainText('169 581,49 €');
});

test('un tableau illisible est refusé sans rien enregistrer', async ({ page }) => {
  await createTestLoan(page);
  await page.getByRole('button', { name: 'Charger le tableau de la banque' }).click();
  await page.getByLabel('Tableau collé').fill('bonjour\nceci n’est pas un tableau');
  await expect(page.getByRole('alert')).toContainText('Aucune échéance trouvée');
  await expect(page.getByRole('button', { name: 'Enregistrer les échéances' })).toBeDisabled();
});

test('sans le tableau : générer un échéancier théorique, signalé comme estimé', async ({
  page,
}, testInfo) => {
  await createTestLoan(page);
  await page.getByRole('button', { name: 'Générer un échéancier estimé' }).click();
  await expect(page.getByText('Échéancier estimé généré : 240 échéances.')).toBeVisible();
  await expect(page.getByText('Échéancier estimé', { exact: true })).toBeVisible();
  await expect(page.getByText(/Échéancier estimé à partir des paramètres du prêt/)).toBeVisible();
  await expect(page.getByRole('row', { name: /^2037/ })).toContainText('0,00 €');
  await capture(page, testInfo, 'us07-estime');

  // Modifier le prêt recalcule l'échéancier estimé.
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.getByLabel('Durée (mois) *').fill('120');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Prêt modifié, échéancier estimé recalculé.')).toBeVisible();
  await expect(page.getByRole('row', { name: /^2027/ })).toContainText('0,00 €');
  await expect(page.getByRole('row', { name: /^2028/ })).toHaveCount(0);
});

test('le jeu de test charge son prêt et ses 240 échéances ; capital restant dû à toute date', async ({
  page,
}, testInfo) => {
  await startWithTestData(page);
  await goToProperty(page, 'Prêt');
  await expect(page.getByText('Tableau de la banque', { exact: true })).toBeVisible();
  await expect(page.locator('.loan-years tbody tr')).toHaveCount(21); // 2017 à 2037
  const counts = await page.locator('.loan-years tbody td:nth-child(2)').allTextContents();
  expect(counts.reduce((s, c) => s + Number(c), 0)).toBe(240);

  const outstanding = page.getByTestId('outstanding');
  await expect(outstanding).toHaveText('100 571,00 €'); // au 01/11/2026
  await page.getByLabel('Capital restant dû au').fill('2024-12-31');
  await expect(outstanding).toHaveText('115 654,93 €');
  await page.getByLabel('Capital restant dû au').fill('2017-12-04');
  await expect(outstanding).toHaveText('170 190,00 €');
  await page.getByLabel('Capital restant dû au').fill('2017-12-05');
  await expect(outstanding).toHaveText('169 581,49 €');

  await capture(page, testInfo, 'us07-jeu-de-test');
  await expectNoHorizontalScroll(page);
});

test('supprimer un prêt et ses échéances', async ({ page }) => {
  await startWithTestData(page);
  await goToProperty(page, 'Prêt');
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Prêt supprimé.')).toBeVisible();
  await expect(page.getByText('Aucun prêt pour ce bien.')).toBeVisible();
  await goTo(page, 'Paramètres');
  await expect(page.getByText(/1 bien, 289 mouvements, 0 échéances de prêt/).first()).toBeVisible();
});
