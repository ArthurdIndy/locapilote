/** Recette de la pull request #3 : régimes fiscaux compatibles avec le type de location. */
import { createProperty, expect, goTo, startEmpty, startWithTestData, test } from './helpers';

test('la liste des régimes dépend du type de location', async ({ page }) => {
  await startEmpty(page);
  const type = page.getByLabel('Type de location');
  const regime = page.getByLabel('Régime fiscal');
  const options = () => regime.locator('option:not([value=""])').allTextContents();

  await type.selectOption({ label: 'Meublée' });
  expect(await options()).toEqual(['LMNP micro-BIC', 'LMNP au réel', 'LMP au réel']);
  await type.selectOption({ label: 'Saisonnière' });
  expect(await options()).toEqual(['LMNP micro-BIC', 'LMNP au réel', 'LMP au réel']);
  await type.selectOption({ label: 'Nue' });
  expect(await options()).toEqual(['Micro-foncier', 'Réel foncier']);
});

test('passer en location nue vide un régime LMNP et bloque l’enregistrement', async ({ page }) => {
  await startWithTestData(page);
  await goTo(page, 'Biens');
  await page.getByRole('button', { name: 'Modifier' }).click();
  await expect(page.getByLabel('Régime fiscal')).toHaveValue('lmnp-reel');
  await page.getByLabel('Type de location').selectOption({ label: 'Nue' });
  await expect(page.getByText(/ne correspond pas à ce type de location/)).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('alert')).toContainText('Choisis un régime fiscal.');

  await page.getByLabel('Régime fiscal').selectOption({ label: 'Réel foncier' });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Bien « Appartement exemple » modifié.')).toBeVisible();
  await expect(page.getByText(/Nue · Réel foncier/)).toBeVisible();
});

test('un nouveau bien meublé peut être en LMP au réel', async ({ page }) => {
  await startEmpty(page);
  await page.getByLabel('Régime fiscal').selectOption({ label: 'LMP au réel' });
  await page.getByLabel('Nom du bien *').fill('Meublé LMP');
  await page.getByLabel('Date d’acquisition *').fill('2021-01-01');
  await page.getByRole('button', { name: 'Créer le bien' }).click();
  await expect(page.getByText(/Meublée · LMP au réel/)).toBeVisible();
});

test('l’import refuse une sauvegarde avec un régime incompatible', async ({ page }) => {
  await startEmpty(page);
  await createProperty(page, 'Bien valide');
  await goTo(page, 'Données');
  const backup = {
    application: 'locapilote',
    formatVersion: 1,
    exportedAt: '2026-11-01T00:00:00.000Z',
    data: {
      properties: [
        {
          id: 'X',
          name: 'Incohérent',
          rentalType: 'unfurnished',
          taxRegime: 'lmnp-reel',
          acquisitionDate: '2020-01-01',
        },
      ],
      categories: [],
      transactions: [],
      loans: [],
      loanInstallments: [],
      assets: [],
      accountantCarryforwards: [],
      preRentalExpenses: [],
      assumptions: [],
    },
  };
  await page.locator('input[type=file]').setInputFiles({
    name: 'incoherent.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByText(/n’est pas compatible avec son type de location/)).toBeVisible();
  await goTo(page, 'Biens');
  await expect(page.getByRole('heading', { name: 'Bien valide' })).toBeVisible();
});
