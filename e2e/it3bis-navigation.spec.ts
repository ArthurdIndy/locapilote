/**
 * Recette de l'itération 3 bis, étape 1 : navigation en 6 entrées (docs/backlog.md,
 * « Navigation : 6 entrées au lieu de 10 »).
 */
import {
  capture,
  createProperty,
  expect,
  expectNoHorizontalScroll,
  goTo,
  goToProperty,
  isPhone,
  openPhoneMenu,
  openSettings,
  startWithTestData,
  test,
} from './helpers';

const ENTRIES = ['Accueil', 'Mouvements', 'Synthèse', 'Fiscalité', 'Simulations', 'Mon bien'];
const BOTTOM_BAR = ENTRIES.slice(0, 5);

test.beforeEach(async ({ page }) => {
  await startWithTestData(page);
});

test('ordinateur : les 6 entrées tiennent sur une ligne, plus l’icône ⚙', async ({
  page,
}, testInfo) => {
  test.skip(isPhone(testInfo), 'ordinateur seulement');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link')).toHaveText(ENTRIES);
  const box = await nav.boundingBox();
  expect(box!.height).toBeLessThan(60);
  // L'icône ⚙ est en haut à droite.
  const gear = page.getByRole('link', { name: 'Paramètres', exact: true });
  await expect(gear).toBeVisible();
  await expect(gear).toHaveText('⚙');
  const gearBox = await gear.boundingBox();
  expect(gearBox!.y).toBeLessThan(box!.y);
  expect(gearBox!.x + gearBox!.width).toBeGreaterThan(box!.x + box!.width - 60);
  await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
  await capture(page, testInfo, 'it3bis-menu');
});

test('téléphone : 5 entrées dans une barre fixe en bas, « Mon bien » et ⚙ dans le menu ☰', async ({
  page,
}, testInfo) => {
  test.skip(!isPhone(testInfo), 'téléphone seulement');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link')).toHaveText(BOTTOM_BAR);
  await expect(page.getByRole('link', { name: 'Paramètres', exact: true })).toBeHidden();

  // La barre reste collée en bas de l'écran, même après défilement.
  const viewport = page.viewportSize()!;
  await goTo(page, 'Synthèse');
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(async () => {
      const box = await nav.boundingBox();
      return Math.round(box!.y + box!.height);
    })
    .toBe(viewport.height);
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'it3bis-barre-du-bas', { fullPage: false });

  await openPhoneMenu(page);
  const menu = page.getByRole('navigation', { name: 'Menu' });
  await expect(menu.getByRole('link')).toHaveText(['Mon bien', '⚙ Paramètres']);
  await capture(page, testInfo, 'it3bis-menu', { fullPage: false });
  await menu.getByRole('link', { name: 'Mon bien' }).click();
  await expect(page.getByRole('heading', { name: 'Mon bien · Appartement exemple' })).toBeVisible();
  await expect(menu).toBeHidden();
});

test('chaque entrée ouvre sa page', async ({ page }) => {
  for (const [label, heading] of [
    ['Mouvements', 'Mouvements'],
    ['Synthèse', 'Synthèse · Appartement exemple'],
    ['Fiscalité', 'Fiscalité · Appartement exemple'],
    ['Simulations', 'Simulations'],
    ['Mon bien', 'Mon bien · Appartement exemple'],
    ['Paramètres', 'Paramètres'],
    ['Accueil', 'Appartement exemple'],
  ] as const) {
    await goTo(page, label);
    await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
  }
});

test('Mon bien : informations, prêt et immobilisations du bien', async ({ page }, testInfo) => {
  await goTo(page, 'Mon bien');
  const sections = page.getByRole('navigation', { name: 'Sections du bien' });
  await expect(sections.getByRole('link')).toHaveText(['Informations', 'Prêt', 'Immobilisations']);
  const info = page.getByRole('region', { name: 'Informations du bien' });
  await expect(info).toContainText('LMNP au réel');
  await expect(info).toContainText('18/05/2024');
  await expect(info.getByRole('button', { name: 'Modifier' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'it3bis-mon-bien');

  await goToProperty(page, 'Prêt');
  await expect(page).toHaveURL(/#\/mon-bien\?section=pret$/);
  await expect(page.getByRole('region', { name: 'Prêt BANQUE' })).toBeVisible();
  await expect(page.getByTestId('outstanding')).toHaveText('100 571,00 €');

  await goToProperty(page, 'Immobilisations');
  await expect(page).toHaveURL(/#\/mon-bien\?section=immobilisations$/);
  await expect(page.getByRole('button', { name: 'Nouvelle immobilisation' })).toBeVisible();
  await expect(page.getByText('9 388,39 €').filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('Mon bien : avec plusieurs biens, on choisit le bien avec « Bien courant »', async ({
  page,
}) => {
  await goTo(page, 'Mon bien');
  await page.getByRole('button', { name: 'Ajouter un bien' }).click();
  await createProperty(page, 'Studio second');
  await expect(page.getByRole('heading', { name: 'Mon bien · Studio second' })).toBeVisible();
  const selector = page.getByLabel('Bien courant');
  await expect(selector).toBeVisible();
  await selector.selectOption({ label: 'Appartement exemple' });
  await expect(page.getByRole('heading', { name: 'Mon bien · Appartement exemple' })).toBeVisible();
  await goToProperty(page, 'Prêt');
  await expect(page.getByRole('region', { name: 'Prêt BANQUE' })).toBeVisible();
  await selector.selectOption({ label: 'Studio second' });
  await expect(page.getByText('Aucun prêt pour ce bien.')).toBeVisible();
});

test('Simulations : page d’attente qui annonce la vente et le budget', async ({
  page,
}, testInfo) => {
  await goTo(page, 'Simulations');
  const main = page.getByRole('main');
  await expect(main).toContainText('Vente');
  await expect(main).toContainText('Budget');
  await expect(main).toContainText('itération 4');
  await capture(page, testInfo, 'it3bis-simulations');
});

test('⚙ Paramètres : export, import et jeu de test', async ({ page }) => {
  await openSettings(page);
  await expect(page).toHaveURL(/#\/parametres$/);
  for (const name of [
    'Exporter toutes mes données (JSON)',
    'Importer une sauvegarde…',
    'Exporter les mouvements (CSV)',
    'Charger le jeu de test',
  ]) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
});

test.describe('les anciennes adresses redirigent vers leur nouvelle place', () => {
  for (const [old, url, heading] of [
    ['biens', /#\/mon-bien\?section=informations$/, 'Informations'],
    ['pret', /#\/mon-bien\?section=pret$/, 'Prêt'],
    ['immobilisations', /#\/mon-bien\?section=immobilisations$/, 'Immobilisations'],
    ['donnees', /#\/parametres$/, 'Paramètres'],
  ] as const) {
    test(`#/${old}`, async ({ page }) => {
      await page.goto(`/#/${old}`);
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    });
  }
});

test('les liens internes mènent au bon endroit', async ({ page }) => {
  // Fiscalité → mouvement « À valider » concerné.
  await goTo(page, 'Fiscalité');
  await page.getByRole('link', { name: 'Voir le mouvement concerné' }).click();
  await expect(page.getByRole('heading', { name: 'Mouvements' })).toBeVisible();
  await expect(page.locator('.transaction')).toHaveCount(1);

  // Fiscalité → immobilisations (Mon bien).
  await goTo(page, 'Fiscalité');
  await page.getByRole('link', { name: 'immobilisations', exact: true }).click();
  await expect(page).toHaveURL(/#\/mon-bien\?section=immobilisations$/);
  await expect(page.getByRole('button', { name: 'Nouvelle immobilisation' })).toBeVisible();

  // Synthèse → détail fiscal.
  await goTo(page, 'Synthèse');
  await page.getByRole('link', { name: 'Voir le détail fiscal' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Fiscalité · Appartement exemple' }),
  ).toBeVisible();

  // Pied de page → Données (⚙ Paramètres).
  await page.getByRole('contentinfo').getByRole('link', { name: '⚙ Paramètres' }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Exporter toutes mes données (JSON)' }),
  ).toBeVisible();
});
