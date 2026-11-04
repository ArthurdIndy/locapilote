/**
 * Recette de l'itération 3 bis, étape 1 : navigation (docs/backlog.md, « Navigation »). La
 * disposition du menu (ordinateur et téléphone) a changé à l'itération 4b : ses tests sont
 * dans it4b-nav-operations.spec.ts.
 */
import {
  capture,
  createProperty,
  expect,
  expectNoHorizontalScroll,
  goTo,
  goToProperty,
  isPhone,
  openSettings,
  startWithTestData,
  test,
  titlePicker,
  chooseProperty,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await startWithTestData(page);
});

test('chaque entrée ouvre sa page', async ({ page }) => {
  for (const [label, heading] of [
    ['Opérations', 'Opérations · Appartement exemple'],
    ['Synthèse', 'Synthèse · Appartement exemple'],
    ['Budget', 'Budget · Appartement exemple'],
    ['Fiscalité', 'Fiscalité · Appartement exemple'],
    ['Simulations', 'Simulations · Appartement exemple'],
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

const SECOND = 'Bien 22';

test.describe('règle multi-biens', () => {
  test.beforeEach(async ({ page }) => {
    await goTo(page, 'Mon bien');
    await page.getByRole('button', { name: 'Ajouter un bien' }).click();
    await createProperty(page, SECOND);
  });

  test('l’Accueil montre une carte par bien ; un clic la rend courante et ouvre sa Synthèse', async ({
    page,
  }) => {
    await goTo(page, 'Accueil');
    const main = page.getByRole('main');
    const cards = main.locator('.property-card[aria-label]');
    await expect(cards).toHaveCount(2);
    const first = main.getByRole('region', { name: 'Appartement exemple' });
    await expect(first).toContainText('Meublée · LMNP au réel');
    await expect(main.getByRole('region', { name: SECOND })).toBeVisible();
    // Chaque carte a un lien visible « Voir la synthèse › ».
    for (const card of await cards.all()) {
      const link = card.getByRole('link', { name: /^Voir la synthèse/ });
      await expect(link).toBeVisible();
      await expect(link).toContainText('›');
    }
    // La carte « + Ajouter un bien » vient en dernier.
    await expect(main.getByRole('listitem').last()).toHaveText('+ Ajouter un bien');
    await expectNoHorizontalScroll(page);

    // Un clic sur le lien ouvre la Synthèse du bien.
    await first.getByRole('link', { name: /^Voir la synthèse/ }).click();
    await expect(page).toHaveURL(/#\/synthese$/);
    await expect(titlePicker(page)).toHaveText(/^Appartement exemple/);

    // Un clic ailleurs dans la carte aussi (en haut à gauche, sur le nom).
    await goTo(page, 'Accueil');
    await main.getByRole('region', { name: SECOND }).click({ position: { x: 30, y: 30 } });
    await expect(page).toHaveURL(/#\/synthese$/);
    await expect(titlePicker(page)).toHaveText(new RegExp(`^${SECOND}`));
  });

  test('les autres pages montrent le bien courant, choisi dans le titre', async ({ page }) => {
    // Le titre-sélecteur est dans le titre de chaque page d'un bien ; rien dans l'en-tête.
    for (const [label, title] of [
      ['Opérations', 'Opérations'],
      ['Synthèse', 'Synthèse'],
      ['Budget', 'Budget'],
      ['Simulations', 'Simulations'],
      ['Fiscalité', 'Fiscalité'],
      ['Mon bien', 'Mon bien'],
    ] as const) {
      await goTo(page, label);
      await expect(
        page.getByRole('heading', { level: 2, name: `${title} · ${SECOND}` }),
      ).toBeVisible();
      await expect(titlePicker(page)).toBeVisible();
      await expect(page.getByRole('banner').getByRole('combobox')).toHaveCount(0);
    }

    // Mon bien : le bien courant, et son prêt.
    await chooseProperty(page, 'Appartement exemple');
    await goToProperty(page, 'Prêt');
    await expect(page.getByRole('region', { name: 'Prêt BANQUE' })).toBeVisible();
    await chooseProperty(page, SECOND);
    await expect(page.getByText('Aucun prêt pour ce bien.')).toBeVisible();

    // Opérations : seulement celles du bien courant ; plus de filtre « Bien ».
    await goTo(page, 'Opérations');
    await chooseProperty(page, 'Appartement exemple');
    await expect(page.getByRole('region', { name: 'Filtres' }).getByLabel('Bien')).toHaveCount(0);
    await expect(page.getByText(/^289 opérations · /)).toBeVisible();

    // Un lien vers les opérations d'un bien rend ce bien courant.
    await chooseProperty(page, SECOND);
    await page.goto('/#/operations?bien=APPART-01&annee=2024&fiscal=a-valider');
    await expect(titlePicker(page)).toHaveText(/^Appartement exemple/);
    await expect(page.locator('.transaction')).toHaveCount(1);

    // Même chose avec l'ancienne adresse (#/mouvements…), redirigée avec ses filtres.
    await chooseProperty(page, SECOND);
    await page.goto('/#/mouvements?bien=APPART-01&annee=2024&fiscal=a-valider');
    await expect(page).toHaveURL(/#\/operations\?bien=APPART-01&annee=2024&fiscal=a-valider$/);
    await expect(titlePicker(page)).toHaveText(/^Appartement exemple/);
    await expect(page.locator('.transaction')).toHaveCount(1);
  });

  test('Opérations vide : seulement le message et le bouton « Nouvelle opération »', async ({
    page,
  }, testInfo) => {
    await goTo(page, 'Opérations');
    await expect(titlePicker(page)).toHaveText(new RegExp(`^${SECOND}`));
    await expect(page.getByText('Aucune opération pour l’instant.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvelle opération' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Filtres' })).toHaveCount(0);
    await expect(page.getByText(/opérations? · recettes/)).toHaveCount(0);
    await capture(page, testInfo, 'it3bis-mouvements-vide');
  });

  test('titre-sélecteur : une ligne, le nom comme le titre, ▾ discret, menu au clic', async ({
    page,
  }, testInfo) => {
    await goTo(page, 'Opérations');
    const heading = page.getByRole('heading', { level: 2, name: `Opérations · ${SECOND}` });
    const picker = titlePicker(page);
    // Pas de liste déroulante native.
    await expect(page.getByRole('main').getByRole('combobox')).toHaveCount(0);
    // Une seule ligne.
    const lineHeight = await heading.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await heading.boundingBox())!.height).toBeLessThan(lineHeight * 1.5);
    // Même police et même taille que le titre, sans bordure ni fond.
    const style = await picker.evaluate((el) => {
      const s = getComputedStyle(el);
      const h = getComputedStyle(el.closest('h2')!);
      return {
        sameFont: s.fontFamily === h.fontFamily && s.fontSize === h.fontSize,
        sameWeight: s.fontWeight === h.fontWeight,
        border: s.borderStyle,
        background: s.backgroundColor,
      };
    });
    expect(style).toEqual({
      sameFont: true,
      sameWeight: true,
      border: 'none',
      background: 'rgba(0, 0, 0, 0)',
    });
    // ▾ collé au nom ; soulignement au survol.
    await expect(picker).toContainText('▾');
    const name = picker.locator('.property-title-name');
    await picker.hover();
    await expect(name).toHaveCSS('text-decoration-line', 'underline');
    // Le bouton d'action est aligné verticalement sur la ligne du titre.
    const titleBox = (await heading.boundingBox())!;
    const actionBox = (await page
      .getByRole('button', { name: 'Nouvelle opération' })
      .boundingBox())!;
    expect(
      Math.abs(titleBox.y + titleBox.height / 2 - (actionBox.y + actionBox.height / 2)),
    ).toBeLessThan(4);
    // Le menu des biens s'ouvre au clic, et se referme après le choix.
    await picker.click();
    const menu = page.getByRole('menu', { name: 'Choisir le bien' });
    await expect(menu.getByRole('menuitemradio')).toHaveText(['Appartement exemple', SECOND]);
    await expect(menu.getByRole('menuitemradio', { name: SECOND })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await capture(page, testInfo, 'it3bis-titre-selecteur', { fullPage: false });
    await menu.getByRole('menuitemradio', { name: 'Appartement exemple' }).click();
    await expect(menu).toBeHidden();
    await expect(heading).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Opérations · Appartement exemple' }),
    ).toBeVisible();
    // Échap referme le menu.
    await picker.click();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('captures : chaque page avec deux biens', async ({ page }, testInfo) => {
    await chooseProperty(page, 'Appartement exemple');
    for (const [label, name] of [
      ['Accueil', 'accueil'],
      ['Opérations', 'operations'],
      ['Synthèse', 'synthese'],
      ['Budget', 'budget'],
      ['Fiscalité', 'fiscalite'],
      ['Simulations', 'simulations'],
      ['Mon bien', 'mon-bien'],
      ['Paramètres', 'parametres'],
    ] as const) {
      await goTo(page, label);
      await expectNoHorizontalScroll(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await capture(page, testInfo, `it3bis-deux-biens-${name}`, { fullPage: false });
    }
  });
});

test('téléphone : un nom de bien long est tronqué avec « … », le ▾ reste visible', async ({
  page,
}, testInfo) => {
  test.skip(!isPhone(testInfo), 'téléphone seulement');
  await goTo(page, 'Mon bien');
  await page.getByRole('button', { name: 'Ajouter un bien' }).click();
  await createProperty(page, 'Appartement de la rue des Longues-Herbes');
  await goTo(page, 'Opérations');
  const picker = titlePicker(page);
  const name = picker.locator('.property-title-name');
  // Le titre doit d'abord afficher le nouveau bien (la liste des biens se met à jour après la
  // création) ; la troncature se vérifie ensuite, avec réessai.
  await expect(name).toHaveText('Appartement de la rue des Longues-Herbes');
  await expect(name).toHaveCSS('text-overflow', 'ellipsis');
  await expect.poll(() => name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const caret = picker.locator('.property-title-caret');
  await expect(caret).toBeInViewport({ ratio: 1 });
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'it3bis-nom-long', { fullPage: false });
});

test('ajouter un bien : carte « + Ajouter un bien » de l’Accueil', async ({ page }) => {
  await page.getByRole('main').getByRole('link', { name: '+ Ajouter un bien' }).click();
  await expect(page.getByRole('heading', { name: 'Nouveau bien' })).toBeVisible();
  await createProperty(page, 'Studio ajouté');
  await expect(page).toHaveURL(/#\/mon-bien\?section=informations$/);
  await expect(titlePicker(page)).toHaveText(/^Studio ajouté/);
  await goTo(page, 'Accueil');
  await expect(page.getByRole('main').getByRole('region')).toHaveCount(2);
});

test('ajouter un bien : bouton en haut de Mon bien, à droite du titre', async ({
  page,
}, testInfo) => {
  await goTo(page, 'Mon bien');
  const title = page.getByRole('heading', { level: 2, name: 'Mon bien · Appartement exemple' });
  const button = page.getByRole('button', { name: 'Ajouter un bien' });
  const titleBox = (await title.boundingBox())!;
  const buttonBox = (await button.boundingBox())!;
  // À droite du titre, sur sa première ligne.
  expect(buttonBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width - 1);
  expect(buttonBox.y).toBeLessThan(titleBox.y + titleBox.height);
  // Au-dessus des onglets de la fiche.
  const tabs = page.getByRole('navigation', { name: 'Sections du bien' });
  expect(buttonBox.y).toBeLessThan((await tabs.boundingBox())!.y);
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'it3bis-mon-bien-ajouter', { fullPage: false });
  await button.click();
  await expect(page.getByRole('heading', { name: 'Nouveau bien' })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(title).toBeVisible();
});

test('Simulations : la vente (US11)', async ({ page }, testInfo) => {
  await goTo(page, 'Simulations');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Vente', exact: true })).toBeVisible();
  // Simulations ne contient plus que la vente : aucune mention du budget.
  await expect(main).not.toContainText(/budget/i);
  await capture(page, testInfo, 'it3bis-simulations');
});

test('⚙ Paramètres : export, import et jeu de test', async ({ page }) => {
  await openSettings(page);
  await expect(page).toHaveURL(/#\/parametres$/);
  for (const name of [
    'Exporter toutes mes données (JSON)',
    'Importer une sauvegarde…',
    'Exporter les opérations (CSV)',
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
    ['mouvements', /#\/operations$/, 'Opérations · Appartement exemple'],
  ] as const) {
    test(`#/${old}`, async ({ page }) => {
      await page.goto(`/#/${old}`);
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    });
  }
});

test('les liens internes mènent au bon endroit', async ({ page }) => {
  // Fiscalité → opération « À valider » concernée.
  await goTo(page, 'Fiscalité');
  await page.getByRole('link', { name: 'Voir l’opération concernée' }).click();
  await expect(page.getByRole('heading', { name: 'Opérations' })).toBeVisible();
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
