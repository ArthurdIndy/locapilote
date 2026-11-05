/**
 * Recette de l'itération 4b : menu réorganisé (maintenant, passé, présent, futur), bouton
 * « + Opération », liste « Toutes les opérations », page Budget (remplie à l'itération 4c, voir us12-budget.spec.ts)
 * et Synthèse limitée aux 3 dernières années sur ordinateur (docs/backlog.md, « Navigation »).
 */
import {
  capture,
  createProperty,
  expect,
  expectNoHorizontalScroll,
  goTo,
  goToTransactions,
  isPhone,
  openDetail,
  openNewTransaction,
  openPhoneMenu,
  startWithTestData,
  test,
  titlePicker,
} from './helpers';

const MAIN_ENTRIES = ['Accueil', 'Synthèse', 'Budget', 'Simulations'];

test.beforeEach(async ({ page }) => {
  await startWithTestData(page);
});

test('ordinateur : Accueil · Synthèse · Budget · Simulations à gauche ; Fiscalité, Mon bien, « + Opération » et ⚙ à droite, plus discrets', async ({
  page,
}, testInfo) => {
  test.skip(isPhone(testInfo), 'ordinateur seulement');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  // Dans l'ordre : les 4 entrées principales, puis le second plan à droite.
  await expect(nav.getByRole('link')).toHaveText([
    ...MAIN_ENTRIES,
    'Fiscalité',
    'Mon bien',
    '+ Opération',
    '⚙',
  ]);
  await expect(nav.getByRole('link', { name: 'Paramètres', exact: true })).toHaveText('⚙');
  // Une seule ligne.
  const navBox = (await nav.boundingBox())!;
  expect(navBox.height).toBeLessThan(60);
  const boxes = [];
  for (const link of await nav.getByRole('link').all()) boxes.push((await link.boundingBox())!);
  for (const box of boxes) {
    expect(box.y).toBeGreaterThanOrEqual(navBox.y);
    expect(box.y + box.height).toBeLessThanOrEqual(navBox.y + navBox.height);
  }
  // Le second plan est à droite (calé sur le bord droit), nettement séparé des entrées principales.
  const simulations = boxes[3]!;
  const fiscalite = boxes[4]!;
  const gear = boxes.at(-1)!;
  expect(fiscalite.x - (simulations.x + simulations.width)).toBeGreaterThan(40);
  expect(gear.x + gear.width).toBeGreaterThan(navBox.x + navBox.width - 2);
  // Plus petit et plus discret : police plus petite et moins grasse.
  const style = (name: string) =>
    nav.getByRole('link', { name, exact: true }).evaluate((el) => ({
      size: parseFloat(getComputedStyle(el).fontSize),
      weight: Number(getComputedStyle(el).fontWeight),
    }));
  const main = await style('Synthèse');
  for (const name of ['Fiscalité', 'Mon bien']) {
    const secondary = await style(name);
    expect(secondary.size).toBeLessThan(main.size);
    expect(secondary.weight).toBeLessThan(main.weight);
  }
  // Pas de menu ☰ sur ordinateur.
  await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
  await capture(page, testInfo, 'it4b-menu', { fullPage: false });
});

test('téléphone : 4 onglets qui tiennent sur 375 px, « + Opération » en haut, le reste dans le menu ☰', async ({
  page,
}, testInfo) => {
  test.skip(!isPhone(testInfo), 'téléphone seulement');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link')).toHaveText(MAIN_ENTRIES);
  // Fiscalité, Mon bien et ⚙ ne sont pas visibles hors du menu ☰.
  for (const name of ['Fiscalité', 'Mon bien', 'Paramètres']) {
    await expect(page.getByRole('link', { name, exact: true })).toBeHidden();
  }

  // Une seule ligne, en haut de la page, sans défilement : chaque onglet est entièrement visible.
  const box = (await nav.boundingBox())!;
  expect(box.height).toBeLessThan(60);
  expect(box.y).toBeLessThan(200);
  expect(await nav.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  const width = page.viewportSize()!.width;
  for (const tab of await nav.getByRole('link').all()) {
    const tabBox = (await tab.boundingBox())!;
    expect(tabBox.x).toBeGreaterThanOrEqual(0);
    expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(width);
    expect(await tab.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }

  // « + Opération » dans la barre du haut, au-dessus des onglets, à côté de ☰.
  const add = page.getByRole('banner').getByRole('link', { name: '+ Opération', exact: true });
  await expect(add).toBeVisible();
  const addBox = (await add.boundingBox())!;
  const menuBox = (await page.getByRole('button', { name: 'Menu' }).boundingBox())!;
  expect(addBox.y + addBox.height).toBeLessThanOrEqual(box.y);
  expect(addBox.x + addBox.width).toBeLessThanOrEqual(menuBox.x);
  expect(addBox.x + addBox.width).toBeLessThanOrEqual(width);
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'it4b-onglets', { fullPage: false });

  // Le menu ☰ : Fiscalité, Mon bien, Toutes les opérations, ⚙ Paramètres.
  await openPhoneMenu(page);
  const menu = page.getByRole('navigation', { name: 'Menu' });
  await expect(menu.getByRole('link')).toHaveText([
    'Fiscalité',
    'Mon bien',
    'Toutes les opérations',
    '⚙ Paramètres',
  ]);
  await capture(page, testInfo, 'it4b-menu-telephone', { fullPage: false });
  await menu.getByRole('link', { name: 'Toutes les opérations' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Opérations · Appartement exemple' }),
  ).toBeVisible();
  await expect(page.getByText(/^289 opérations · /)).toBeVisible();
  await expect(menu).toBeHidden();
  // Le bouton ☰ signale qu'on est sur une page du menu.
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveClass(/active/);
});

test('les entrées du menu s’ouvrent dans l’ordre : Accueil, Synthèse, Budget, Simulations', async ({
  page,
}) => {
  for (const [label, heading, url] of [
    ['Synthèse', 'Synthèse · Appartement exemple', /#\/synthese$/],
    ['Budget', 'Budget · Appartement exemple', /#\/budget$/],
    ['Simulations', 'Simulations · Appartement exemple', /#\/simulations$/],
    ['Fiscalité', 'Fiscalité · Appartement exemple', /#\/fiscalite$/],
    ['Mon bien', 'Mon bien · Appartement exemple', /#\/mon-bien$/],
    ['Accueil', 'Mes biens', /#\/accueil$/],
  ] as const) {
    await goTo(page, label);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
  }
});

test('« + Opération » ouvre le formulaire de saisie depuis n’importe quelle page, et « Fermer » y ramène', async ({
  page,
}) => {
  for (const [label, url] of [
    ['Accueil', /#\/accueil$/],
    ['Synthèse', /#\/synthese$/],
    ['Budget', /#\/budget$/],
    ['Simulations', /#\/simulations$/],
    ['Fiscalité', /#\/fiscalite$/],
    ['Mon bien', /#\/mon-bien$/],
    ['Paramètres', /#\/parametres$/],
  ] as const) {
    await goTo(page, label);
    await expect(page).toHaveURL(url);
    await openNewTransaction(page);
    await expect(page).toHaveURL(/#\/nouvelle-operation$/);
    // On commence par la catégorie ; date, bien et compte sont pré-remplis.
    await expect(page.getByPlaceholder(/Tape pour chercher/)).toBeFocused();
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-11-01');
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    await expect(page).toHaveURL(url);
  }
});

test('« + Opération » devient « × Fermer » tant que le formulaire est ouvert ; un nouveau clic le referme', async ({
  page,
}, testInfo) => {
  for (const label of ['Synthèse', 'Fiscalité'] as const) {
    await goTo(page, label);
    const url = page.url();
    const add = page.getByRole('link', { name: '+ Opération', exact: true });
    await expect(add).toBeVisible();
    await add.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Nouvelle opération' })).toBeVisible();

    // Le bouton montre son état : « × Fermer », enfoncé, à la même place.
    const close = page.getByRole('button', { name: '× Fermer', exact: true });
    await expect(close).toBeVisible();
    await expect(close).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: '+ Opération', exact: true })).toHaveCount(0);
    if (isPhone(testInfo)) {
      // Téléphone : dans la barre du haut, à côté de ☰.
      await expect(
        page.getByRole('banner').locator('.header-tools').getByRole('button', { name: '× Fermer' }),
      ).toBeVisible();
    } else {
      await expect(
        page
          .getByRole('navigation', { name: 'Navigation principale' })
          .getByRole('button', { name: '× Fermer' }),
      ).toBeVisible();
    }
    if (label === 'Synthèse')
      await capture(page, testInfo, 'it4b-bouton-fermer', { fullPage: false });

    // Un nouveau clic referme le formulaire et ramène à la page d'origine.
    await close.click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { level: 2, name: 'Nouvelle opération' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('link', { name: '+ Opération', exact: true })).toBeVisible();
  }
});

test('« + Opération » : saisir une recette puis une dépense, et les retrouver dans « Toutes les opérations »', async ({
  page,
}, testInfo) => {
  await goTo(page, 'Synthèse');
  await openNewTransaction(page);
  const category = page.getByPlaceholder(/Tape pour chercher/);

  // Une dépense.
  await category.fill('equipement');
  await page
    .getByRole('listbox')
    .getByRole('option', { name: /Petit équipement/ })
    .click();
  await page.getByLabel('Libellé').fill('Ampoules');
  await page.getByLabel('Montant (€)').fill('12,90');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(
    page.getByText(
      'Opération enregistrée (Petit équipement · 12,90 €). Tu peux saisir la suivante.',
    ),
  ).toBeVisible();
  // Le formulaire reste ouvert, prêt pour la suivante.
  await expect(category).toHaveValue('');
  await expect(category).toBeFocused();

  // Une recette.
  await category.fill('loyer hors');
  await page
    .getByRole('listbox')
    .getByRole('option', { name: /Loyer hors charges/ })
    .click();
  await page.getByLabel('Libellé').fill('Loyer novembre');
  await page.getByLabel('Montant (€)').fill('800');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toHaveText(
    /^Opération enregistrée \(Loyer hors charges · 800,00\s€\)/,
  );
  await capture(page, testInfo, 'it4b-saisie');

  // Le lien « Toutes les opérations », à côté du formulaire, ouvre la liste.
  await page.getByRole('link', { name: 'Toutes les opérations ›' }).click();
  await expect(page).toHaveURL(/#\/operations$/);
  await expect(page.getByText(/^291 opérations · /)).toBeVisible();
  await expect(page.locator('.transaction', { hasText: 'Ampoules' })).toContainText('−12,90');
  await expect(page.locator('.transaction', { hasText: 'Loyer novembre' })).toContainText(
    '+800,00',
  );
});

test('« Toutes les opérations » est à côté du formulaire de saisie', async ({ page }, testInfo) => {
  await openNewTransaction(page);
  const heading = page.getByRole('heading', { level: 2, name: 'Nouvelle opération' });
  const link = page.getByRole('link', { name: 'Toutes les opérations ›' });
  await expect(link).toBeVisible();
  const form = page.locator('form');
  // Dans la carte du formulaire, au-dessus des champs.
  await expect(form.getByRole('link', { name: 'Toutes les opérations ›' })).toBeVisible();
  const linkBox = (await link.boundingBox())!;
  const headingBox = (await heading.boundingBox())!;
  const dateBox = (await page.getByLabel('Date', { exact: true }).boundingBox())!;
  expect(linkBox.y + linkBox.height).toBeLessThanOrEqual(dateBox.y);
  if (!isPhone(testInfo)) {
    // Ordinateur : à droite du titre, sur la même ligne.
    expect(linkBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
    expect(
      Math.abs(linkBox.y + linkBox.height / 2 - (headingBox.y + headingBox.height / 2)),
    ).toBeLessThan(6);
  }
  await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'it4b-formulaire', { fullPage: false });

  // « Toutes les opérations » n'est plus une entrée du menu principal.
  await expect(
    page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: /opérations/i }),
  ).toHaveCount(0);

  // Par le menu ☰ (téléphone) ou le lien du formulaire (ordinateur).
  await goToTransactions(page);
  await expect(page).toHaveURL(/#\/operations$/);
  await expect(page.getByText(/^289 opérations · /)).toBeVisible();
});

test('la Synthèse mène aux opérations filtrées (groupe et année)', async ({ page }, testInfo) => {
  await goTo(page, 'Synthèse');
  await openDetail(page, 'Recettes encaissées');
  const group = 'Loyers';
  if (isPhone(testInfo)) {
    await page
      .getByRole('region', { name: 'Année 2024' })
      .locator('.year-lines > div.detail')
      .filter({ hasText: group })
      .getByRole('link', { name: group, exact: true })
      .click();
  } else {
    await page.getByRole('link', { name: new RegExp(`^${group} 2024 : `) }).click();
  }
  await expect(page).toHaveURL(/#\/operations\?bien=APPART-01&annee=2024&groupe=Loyers$/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Opérations · Appartement exemple' }),
  ).toBeVisible();
  const filters = page.getByRole('region', { name: 'Filtres' });
  await expect(filters.getByLabel('Année')).toHaveValue('2024');
  await expect(filters.getByLabel('Groupe')).toHaveValue(group);
});

test.describe('Synthèse : fenêtre de 3 ans sur ordinateur', () => {
  test('jeu de test (loué depuis 2024) : 3 années, pas de navigation', async ({
    page,
  }, testInfo) => {
    await goTo(page, 'Synthèse');
    await expect(page.getByRole('navigation', { name: 'Années affichées' })).toHaveCount(0);
    if (isPhone(testInfo)) {
      await expect(page.locator('.year-card h3')).toHaveText(['2026', '2025', '2024']);
    } else {
      const table = page.getByRole('table', { name: 'Synthèse annuelle' });
      await expect(table.locator('thead th')).toHaveText(['Indicateur', '2024', '2025', '2026']);
    }
  });

  test('libellés sur une ligne, de largeur fixe ; les colonnes d’années s’adaptent', async ({
    page,
  }, testInfo) => {
    test.skip(isPhone(testInfo), 'ordinateur seulement');
    await goTo(page, 'Synthèse');
    const table = page.getByRole('table', { name: 'Synthèse annuelle' });
    for (const name of [
      'Échéances de prêt (période louée)',
      'Enrichissement (cash-flow + capital remboursé)',
      'Charges de copropriété restant à ma charge',
    ]) {
      const header = table.getByRole('rowheader', { name, exact: true });
      const lineHeight = await header.evaluate((el) => {
        const s = getComputedStyle(el);
        return parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.5;
      });
      const box = (await header.boundingBox())!;
      // Une seule ligne (padding compris), et rien de coupé.
      expect(box.height).toBeLessThan(lineHeight * 1.5 + 16);
      expect(await header.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    // Pas de défilement horizontal du tableau : la dernière année est visible.
    const wide = page.locator('.synthesis-wide');
    expect(await wide.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    await expect(table.locator('thead th').last()).toBeInViewport();
    // La colonne des libellés garde sa largeur quand la fenêtre étroite les colonnes d'années.
    const labelWidth = async () => (await table.locator('thead th').first().boundingBox())!.width;
    const before = await labelWidth();
    await page.setViewportSize({ width: 1000, height: 900 });
    expect(Math.abs((await labelWidth()) - before)).toBeLessThan(1);
    expect(await wide.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('bien loué depuis 2020 : 3 dernières années, « ‹ 2021–2023 » et « 2024–2026 › »', async ({
    page,
  }, testInfo) => {
    await goTo(page, 'Mon bien');
    await page.getByRole('button', { name: 'Ajouter un bien' }).click();
    await createProperty(page, 'Studio ancien', { rentalStart: '2020-03-15' });
    await goTo(page, 'Synthèse');
    await expect(titlePicker(page)).toHaveText(/^Studio ancien/);

    if (isPhone(testInfo)) {
      // Téléphone inchangé : une carte par année, la plus récente en premier.
      await expect(page.getByRole('navigation', { name: 'Années affichées' })).toBeHidden();
      await expect(page.locator('.year-card h3')).toHaveText([
        '2026',
        '2025',
        '2024',
        '2023',
        '2022',
        '2021',
        '2020',
      ]);
      await expectNoHorizontalScroll(page);
      await capture(page, testInfo, 'it4b-synthese-annees', { fullPage: false });
      return;
    }

    const table = page.getByRole('table', { name: 'Synthèse annuelle' });
    const headers = table.locator('thead th');
    const window = page.getByRole('navigation', { name: 'Années affichées' });
    const row = table.getByRole('row', { name: /^Cash-flow mensuel moyen/ });
    const wide = page.locator('.synthesis-wide');
    const expectWindow = async (years: string[], previous: string | null, next: string | null) => {
      await expect(headers).toHaveText(['Indicateur', ...years]);
      // Toujours 3 colonnes d'années, sans défilement horizontal.
      await expect(row.locator('td')).toHaveCount(3);
      expect(await wide.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      const buttons = window.getByRole('button');
      await expect(buttons).toHaveText([
        ...(previous ? [`‹ ${previous}`] : []),
        ...(next ? [`${next} ›`] : []),
      ]);
    };

    // Par défaut : les 3 dernières années ; la fenêtre précédente à gauche.
    await expectWindow(['2024', '2025', '2026'], '2021–2023', null);
    // 2024, année bissextile entièrement louée : exactement 12 mois (et non 12,03).
    await expect(
      table
        .getByRole('row', { name: /^Mois de location/ })
        .locator('td')
        .first(),
    ).toHaveText('12,00');
    const previousButton = window.getByRole('button', { name: /^Années précédentes/ });
    const nextButton = window.getByRole('button', { name: /^Années suivantes/ });
    const tableBox = (await table.boundingBox())!;
    expect((await previousButton.boundingBox())!.x).toBeLessThan(tableBox.x + tableBox.width / 2);
    await capture(page, testInfo, 'it4b-synthese-3-ans', { fullPage: false });

    await previousButton.click();
    await expectWindow(['2021', '2022', '2023'], '2020–2022', '2024–2026');
    // La fenêtre suivante est à droite.
    const nextBox = (await nextButton.boundingBox())!;
    expect(nextBox.x + nextBox.width).toBeGreaterThan(tableBox.x + tableBox.width / 2);
    await capture(page, testInfo, 'it4b-synthese-annees', { fullPage: false });

    // La plus ancienne fenêtre garde 3 colonnes (2020 à 2022).
    await previousButton.click();
    await expectWindow(['2020', '2021', '2022'], null, '2021–2023');

    await nextButton.click();
    await expectWindow(['2021', '2022', '2023'], '2020–2022', '2024–2026');
    await nextButton.click();
    await expectWindow(['2024', '2025', '2026'], '2021–2023', null);
  });
});
