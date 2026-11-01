/**
 * Recette de l'itération 1 (pull request #2) : premier lancement, biens (US01),
 * mouvements (US03), sauvegarde et export (US18).
 */
import { readFileSync } from 'node:fs';
import {
  capture,
  createProperty,
  expect,
  expectNoHorizontalScroll,
  goTo,
  goToProperty,
  startEmpty,
  startWithTestData,
  test,
} from './helpers';

test.describe('Premier lancement', () => {
  test('propose de commencer avec le jeu de test ou vide', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Commencer avec le jeu de test/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Démarrer vide/ })).toBeVisible();
    await capture(page, testInfo, 'it1-bienvenue');
  });

  test('avec le jeu de test, l’accueil affiche le bien, son prêt et ses 289 mouvements', async ({
    page,
  }) => {
    await startWithTestData(page);
    await expect(page.getByText('Capital restant dû au 01/11/2026')).toBeVisible();
    await expect(page.getByText('100 571,00 €')).toBeVisible();
    await expect(page.getByRole('link', { name: '289' })).toBeVisible();
  });
});

test.describe('US01 · Biens', () => {
  test('créer un bien à vide, il apparaît dans l’accueil, puis le modifier', async ({
    page,
  }, testInfo) => {
    await startEmpty(page);
    await createProperty(page, 'Studio des tests');
    await expect(page.getByRole('heading', { name: 'Studio des tests' })).toBeVisible();
    await goTo(page, 'Accueil');
    await expect(page.getByRole('heading', { name: 'Studio des tests' })).toBeVisible();

    await goToProperty(page, 'Informations');
    await page.getByRole('button', { name: 'Modifier' }).click();
    await page.getByLabel('Nom du bien *').fill('Studio renommé');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Bien « Studio renommé » modifié.')).toBeVisible();
    await capture(page, testInfo, 'it1-biens');
  });

  test('calcule le coût total d’acquisition', async ({ page }) => {
    await startEmpty(page);
    await page.getByLabel('Prix d’achat net vendeur (€)').fill('100000');
    await page.getByLabel('Frais d’agence (€)').fill('5000');
    await page.getByLabel('Frais de notaire et de garantie (€)').fill('7 500,50');
    await expect(page.getByText('Coût total d’acquisition : 112 500,50 €')).toBeVisible();
  });

  test('refuse un bien sans nom ni date d’acquisition', async ({ page }) => {
    await startEmpty(page);
    await page.getByRole('button', { name: 'Créer le bien' }).click();
    await expect(page.getByRole('alert')).toContainText('Donne un nom au bien.');
    await expect(page.getByRole('alert')).toContainText('Indique la date d’acquisition.');
  });
});

test.describe('US03 · Mouvements', () => {
  test('saisir un mouvement en choisissant la catégorie par recherche sans accents', async ({
    page,
  }, testInfo) => {
    await startWithTestData(page);
    await goTo(page, 'Mouvements');
    await page.getByRole('button', { name: 'Nouveau mouvement' }).click();
    const category = page.getByPlaceholder(/Tape pour chercher/);
    await expect(category).toBeFocused();
    await category.fill('equipement');
    await page
      .getByRole('listbox')
      .getByRole('option', { name: /Petit équipement/ })
      .click();
    await page.getByLabel('Libellé').fill('Ampoules');
    await page.getByLabel('Montant (€)').fill('12,90');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Mouvement enregistré (Petit équipement · 12,90 €)')).toBeVisible();
    // On enchaîne : la catégorie est vide, prête pour la saisie suivante.
    await expect(category).toHaveValue('');
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.getByText('290 mouvements')).toBeVisible();
    await expect(page.locator('.transaction', { hasText: 'Ampoules' })).toBeVisible();
    await capture(page, testInfo, 'it1-mouvements');
    await expectNoHorizontalScroll(page);
  });

  test('refuse un mouvement sans catégorie ni montant', async ({ page }) => {
    await startWithTestData(page);
    await goTo(page, 'Mouvements');
    await page.getByRole('button', { name: 'Nouveau mouvement' }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('alert')).toContainText('Choisis une catégorie dans la liste.');
    await expect(page.getByRole('alert')).toContainText('Montant invalide');
  });

  test('filtrer par année et catégorie, modifier puis supprimer', async ({ page }) => {
    await startWithTestData(page);
    await goTo(page, 'Mouvements');
    const filters = page.getByRole('region', { name: 'Filtres' });
    await filters.getByLabel('Année').selectOption('2025');
    await filters.getByLabel('Catégorie').selectOption('Loyer hors charges');
    await expect(page.getByText(/^14 mouvements · recettes 12\s387,89\s€/)).toBeVisible();

    const first = page.locator('.transaction').first();
    await first.getByRole('button', { name: 'Modifier' }).click();
    await page.getByLabel('Libellé').fill('Loyer décembre (corrigé)');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(/^Mouvement modifié/)).toBeVisible();
    await expect(first).toContainText('Loyer décembre (corrigé)');

    await first.getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText('Mouvement supprimé.')).toBeVisible();
    await expect(page.getByText(/^13 mouvements/)).toBeVisible();

    await page.getByRole('button', { name: 'Effacer les filtres' }).click();
    await expect(page.getByText(/^288 mouvements/)).toBeVisible();
  });
});

test.describe('US18 · Données', () => {
  test('exporter tout en JSON puis réimporter redonne les mêmes données', async ({ page }) => {
    await startWithTestData(page);
    await goTo(page, 'Paramètres');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter toutes mes données (JSON)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('locapilote-sauvegarde-2026-11-01.json');
    const file = await download.path();
    const backup = JSON.parse(readFileSync(file, 'utf8'));
    expect(backup.application).toBe('locapilote');
    expect(backup.data.transactions).toHaveLength(289);
    expect(backup.data.loanInstallments).toHaveLength(240);

    // On supprime un mouvement, puis on réimporte la sauvegarde.
    await goTo(page, 'Mouvements');
    await page.locator('.transaction').first().getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText(/^288 mouvements/)).toBeVisible();
    await goTo(page, 'Paramètres');
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(
      page.getByText(/Import terminé : 1 bien, 289 mouvements, 240 échéances/),
    ).toBeVisible();
  });

  test('refuse un fichier qui n’est pas une sauvegarde, sans rien modifier', async ({ page }) => {
    await startWithTestData(page);
    await goTo(page, 'Paramètres');
    await page.locator('input[type=file]').setInputFiles({
      name: 'faux.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello": 1}'),
    });
    await expect(
      page.getByText(/n’est pas une sauvegarde Locapilote.*Aucune donnée/),
    ).toBeVisible();
  });

  test('exporter les mouvements en CSV pour Excel', async ({ page }, testInfo) => {
    await startWithTestData(page);
    await goTo(page, 'Paramètres');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter les mouvements (CSV)' }).click();
    const download = await downloadPromise;
    const csv = readFileSync(await download.path(), 'utf8');
    expect(csv.startsWith('﻿Date;Bien;Compte;Catégorie;Sens;Libellé;Montant')).toBe(true);
    expect(csv.trim().split('\r\n')).toHaveLength(290);
    await capture(page, testInfo, 'it1-donnees');
  });
});
