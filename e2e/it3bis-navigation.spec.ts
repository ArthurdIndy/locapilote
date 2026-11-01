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
import type { Locator } from '@playwright/test';

const ENTRIES = ['Accueil', 'Mouvements', 'Synthèse', 'Fiscalité', 'Simulations', 'Mon bien'];
const PHONE_TABS = ENTRIES.slice(0, 5);

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

test('téléphone : une ligne d’onglets en haut qui défile ; « Mon bien » et ⚙ dans le menu ☰', async ({
  page,
}, testInfo) => {
  test.skip(!isPhone(testInfo), 'téléphone seulement');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link').filter({ visible: true })).toHaveText(PHONE_TABS);
  await expect(page.getByRole('link', { name: 'Paramètres', exact: true })).toBeHidden();

  // Une seule ligne, sous l'en-tête, en haut de la page (pas de barre fixe en bas).
  const box = await nav.boundingBox();
  expect(box!.height).toBeLessThan(60);
  expect(box!.y).toBeLessThan(200);
  expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe('static');

  // Elle défile du doigt ; l'onglet actif est ramené dans l'écran.
  expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  for (const label of ['Simulations', 'Fiscalité', 'Accueil']) {
    await goTo(page, label);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
    await expectActiveTabFullyVisible(nav);
  }
  await goTo(page, 'Simulations');
  await expectActiveTabFullyVisible(nav);
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'it3bis-onglets', { fullPage: false });

  // Le bas de page n'est plus masqué : le pied de page est visible en fin de défilement.
  await goTo(page, 'Synthèse');
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  await expect(page.getByRole('contentinfo')).toBeInViewport();

  await openPhoneMenu(page);
  const menu = page.getByRole('navigation', { name: 'Menu' });
  await expect(menu.getByRole('link')).toHaveText(['Mon bien', '⚙ Paramètres']);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo, 'it3bis-menu', { fullPage: false });
  await menu.getByRole('link', { name: 'Mon bien' }).click();
  await expect(page.getByRole('heading', { name: 'Mon bien · Appartement exemple' })).toBeVisible();
  await expect(menu).toBeHidden();
});

/**
 * L'onglet actif est entièrement visible dans la ligne d'onglets et dans l'écran. On attend la
 * fin du défilement (position stable), puis on compare les bords à ±1 px près.
 */
async function expectActiveTabFullyVisible(nav: Locator): Promise<void> {
  let previous = -1;
  await expect
    .poll(
      async () => {
        const current = await nav.evaluate((el) => el.scrollLeft);
        const stable = current === previous;
        previous = current;
        return stable;
      },
      { intervals: [100, 100, 200, 200, 500], timeout: 5000 },
    )
    .toBe(true);
  const edges = await nav.evaluate((el) => {
    const tab = el.querySelector('[aria-current="page"]')!.getBoundingClientRect();
    const menu = el.getBoundingClientRect();
    return {
      tabLeft: tab.left,
      tabRight: tab.right,
      left: Math.max(menu.left, 0),
      right: Math.min(menu.right, document.documentElement.clientWidth),
    };
  });
  expect(edges.tabLeft).toBeGreaterThanOrEqual(edges.left - 1);
  expect(edges.tabRight).toBeLessThanOrEqual(edges.right + 1);
}

test('chaque entrée ouvre sa page', async ({ page }) => {
  for (const [label, heading] of [
    ['Mouvements', 'Mouvements · Appartement exemple'],
    ['Synthèse', 'Synthèse · Appartement exemple'],
    ['Fiscalité', 'Fiscalité · Appartement exemple'],
    ['Simulations', 'Simulations'],
    ['Mon bien', 'Mon bien · Appartement exemple'],
    ['Paramètres', 'Paramètres'],
    ['Accueil', 'Mes biens'],
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

test.describe('règle multi-biens', () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, 'Mon bien');
    await page.getByRole('button', { name: 'Ajouter un bien' }).click();
    await createProperty(page, 'Studio second');
  });

  test('l’Accueil montre une carte par bien ; un clic la rend courante et ouvre sa Synthèse', async ({
    page,
  }, testInfo) => {
    await goTo(page, 'Accueil');
    const cards = page.getByRole('main').getByRole('link', { name: /Voir la synthèse/ });
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('Appartement exemple');
    await expect(cards.nth(0)).toContainText('Meublée · LMNP au réel');
    await expect(cards.nth(1)).toContainText('Studio second');
    await expectNoHorizontalScroll(page);
    await capture(page, testInfo, 'it3bis-accueil-biens');

    await cards.nth(0).click();
    await expect(page).toHaveURL(/#\/synthese$/);
    const title = page.getByRole('heading', { level: 2 }).filter({ hasText: 'Synthèse' });
    await expect(title.getByLabel('Bien courant')).toHaveValue(/.+/);
    await expect(title.getByLabel('Bien courant').locator('option:checked')).toHaveText(
      'Appartement exemple',
    );

    await goTo(page, 'Accueil');
    await page
      .getByRole('main')
      .getByRole('link', { name: /Studio second/ })
      .click();
    await expect(page.getByLabel('Bien courant').locator('option:checked')).toHaveText(
      'Studio second',
    );
  });

  test('les autres pages montrent le bien courant, choisi dans le titre', async ({
    page,
  }, testInfo) => {
    const selector = page.getByLabel('Bien courant');
    // Le titre-sélecteur est dans le titre de chaque page d'un bien ; plus de sélecteur en en-tête.
    for (const [label, title] of [
      ['Mouvements', 'Mouvements'],
      ['Synthèse', 'Synthèse'],
      ['Fiscalité', 'Fiscalité'],
      ['Mon bien', 'Mon bien'],
    ] as const) {
      await goTo(page, label);
      const heading = page.getByRole('heading', { level: 2 }).filter({ hasText: title });
      await expect(heading.getByLabel('Bien courant')).toBeVisible();
      await expect(page.getByRole('banner').getByLabel('Bien courant')).toHaveCount(0);
    }

    // Mon bien : le bien courant, et son prêt.
    await selector.selectOption({ label: 'Appartement exemple' });
    await goToProperty(page, 'Prêt');
    await expect(page.getByRole('region', { name: 'Prêt BANQUE' })).toBeVisible();
    await selector.selectOption({ label: 'Studio second' });
    await expect(page.getByText('Aucun prêt pour ce bien.')).toBeVisible();

    // Mouvements : seulement ceux du bien courant ; plus de filtre « Bien ».
    await goTo(page, 'Mouvements');
    await expect(page.getByRole('region', { name: 'Filtres' }).getByLabel('Bien')).toHaveCount(0);
    await expect(page.getByText(/^0 mouvement · /)).toBeVisible();
    await selector.selectOption({ label: 'Appartement exemple' });
    await expect(page.getByText(/^289 mouvements · /)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, testInfo, 'it3bis-titre-selecteur', { fullPage: false });

    // Un lien vers les mouvements d'un bien rend ce bien courant.
    await selector.selectOption({ label: 'Studio second' });
    await page.goto('/#/mouvements?bien=APPART-01&annee=2024&fiscal=a-valider');
    await expect(selector.locator('option:checked')).toHaveText('Appartement exemple');
    await expect(page.locator('.transaction')).toHaveCount(1);
  });
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
