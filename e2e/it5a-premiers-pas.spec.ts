/**
 * Recette de l'itération 5a : premiers pas (US17). Écran de bienvenue, exemple, suppression d'un
 * bien, chargement de l'exemple depuis ⚙ Paramètres, rappel de sauvegarde, bien sans prêt,
 * finitions sur téléphone.
 */
import type { Page } from '@playwright/test';
import {
  capture,
  createProperty,
  expect,
  expectNoHorizontalScroll,
  goTo,
  goToProperty,
  isPhone,
  openSettings,
  startEmpty,
  startWithTestData,
  test,
  TODAY,
} from './helpers';

const welcome = (page: Page) => page.getByRole('heading', { name: 'Bienvenue sur Locapilote' });

/** Avance l'horloge de `days` jours après le 01/11/2026, puis recharge la page. */
async function daysLater(page: Page, days: number): Promise<void> {
  const date = new Date(`${TODAY}T10:00:00`);
  date.setDate(date.getDate() + days);
  await page.clock.setFixedTime(date);
  await page.reload();
}

test.describe('écran de bienvenue', () => {
  test('navigateur vide : la carte de bienvenue, le menu reste affiché', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await expect(welcome(page)).toBeVisible();
    const card = page.getByRole('region', { name: 'Bienvenue sur Locapilote' });
    await expect(card).toContainText(
      'Suis les loyers, les dépenses, la fiscalité et la vente de ton logement en location.',
    );
    await expect(card.getByRole('link', { name: 'Créer mon bien' })).toHaveClass(/primary/);
    await expect(card.getByRole('button', { name: 'Découvrir avec un exemple' })).toBeVisible();
    await expect(card).toContainText(
      'L’exemple est un appartement fictif. Pour repartir de zéro ensuite, supprime-le dans Mon bien.',
    );
    await expect(card).toContainText(
      'Tes données restent dans ce navigateur. Pense à les exporter (',
    );
    // ⚙ Paramètres sur ordinateur, ☰ › Paramètres sur téléphone.
    const desktopHint = card.getByText('⚙ Paramètres', { exact: true });
    const phoneHint = card.getByText('☰ › Paramètres', { exact: true });
    if (isPhone(testInfo)) {
      await expect(phoneHint).toBeVisible();
      await expect(desktopHint).toBeHidden();
    } else {
      await expect(desktopHint).toBeVisible();
      await expect(phoneHint).toBeHidden();
    }
    // Le pied de page ne répète pas la même phrase.
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    // Pas de « Mes biens » ni de rappel de sauvegarde.
    await expect(page.getByRole('heading', { name: 'Mes biens' })).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Rappel de sauvegarde' })).toHaveCount(0);
    // Largeur : ≈ 640 px sur ordinateur, pleine largeur sur téléphone.
    const width = (await card.boundingBox())!.width;
    if (isPhone(testInfo)) expect(width).toBeGreaterThan(330);
    else expect(width).toBeLessThanOrEqual(640);
    await expectNoHorizontalScroll(page);
    await capture(page, testInfo, 'it5a-bienvenue');
  });

  test('sans bien, les pages d’un bien ramènent à l’Accueil', async ({ page }) => {
    await page.goto('/');
    await expect(welcome(page)).toBeVisible();
    for (const hash of [
      'synthese',
      'budget',
      'simulations',
      'fiscalite',
      'mon-bien?section=pret',
      'operations',
      'nouvelle-operation',
    ]) {
      await page.goto(`/#/${hash}`);
      await expect(page).toHaveURL(/#\/accueil$/);
      await expect(welcome(page)).toBeVisible();
    }
    // Par le menu aussi.
    await goTo(page, 'Synthèse');
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(welcome(page)).toBeVisible();
    // ⚙ Paramètres reste accessible.
    await openSettings(page);
    await expect(page.getByRole('heading', { name: 'Paramètres', exact: true })).toBeVisible();
  });

  test('« Découvrir avec un exemple » charge l’exemple et affiche l’Accueil', async ({ page }) => {
    await startWithTestData(page);
    await expect(page).toHaveURL(/#\/accueil$|\/$/);
    await expect(page.getByRole('heading', { name: 'Mes biens' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Appartement exemple' })).toContainText(
      'Meublée · LMNP au réel',
    );
  });

  test('« Créer mon bien » ouvre le formulaire, puis l’Accueil redevient celui d’aujourd’hui', async ({
    page,
  }) => {
    await startEmpty(page);
    await createProperty(page, 'Studio des tests');
    await goTo(page, 'Accueil');
    await expect(page.getByRole('heading', { name: 'Mes biens' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Studio des tests' })).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });
});

test.describe('supprimer un bien', () => {
  test('confirmation : compteurs réels, nom à retaper, puis l’écran de bienvenue', async ({
    page,
  }, testInfo) => {
    await startWithTestData(page);
    await goToProperty(page, 'Informations');
    const remove = page.getByRole('button', { name: 'Supprimer ce bien' });
    await expect(remove).toHaveClass(/danger-outline/);
    await remove.click();

    const dialog = page.getByRole('dialog', { name: 'Supprimer « Appartement exemple » ?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'Tout ce qui le concerne sera supprimé : 289 opérations, 1 prêt et ses 240 échéances, ' +
        '5 immobilisations, les scénarios de vente et les données fiscales. C’est définitif.',
    );
    const confirm = dialog.getByRole('button', { name: 'Supprimer définitivement' });
    await expect(confirm).toBeDisabled();

    // « Exporter mes données d'abord » télécharge la sauvegarde ; la confirmation reste ouverte.
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Exporter mes données d’abord' }).click();
    expect((await download).suggestedFilename()).toBe(`locapilote-sauvegarde-${TODAY}.json`);
    await expect(dialog).toBeVisible();

    const name = dialog.getByLabel('Tape le nom du bien pour confirmer');
    await name.fill('Appartement');
    await expect(confirm).toBeDisabled();
    await name.fill('Appartement exemple');
    await expect(confirm).toBeEnabled();
    await capture(page, testInfo, 'it5a-suppression', { fullPage: false });

    await confirm.click();
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(welcome(page)).toBeVisible();
    // Plus rien du bien : ses pages ramènent à l'Accueil.
    await page.goto('/#/operations');
    await expect(welcome(page)).toBeVisible();
  });

  test('« Annuler » ne supprime rien', async ({ page }) => {
    await startWithTestData(page);
    await goToProperty(page, 'Informations');
    await page.getByRole('button', { name: 'Supprimer ce bien' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);
    await goTo(page, 'Accueil');
    await expect(page.getByRole('region', { name: 'Appartement exemple' })).toBeVisible();
  });

  test('avec deux biens, le bien courant passe à l’autre', async ({ page }) => {
    await startWithTestData(page);
    await page.getByRole('link', { name: '+ Ajouter un bien' }).click();
    await createProperty(page, 'Studio des tests');
    await goToProperty(page, 'Informations');
    await page.getByRole('button', { name: 'Supprimer ce bien' }).click();
    const dialog = page.getByRole('dialog', { name: 'Supprimer « Studio des tests » ?' });
    // Un bien neuf : rien d'autre que le bien lui-même.
    await expect(dialog).toContainText('Le bien sera supprimé. C’est définitif.');
    await dialog.getByLabel('Tape le nom du bien pour confirmer').fill('Studio des tests');
    await dialog.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page.getByRole('heading', { name: 'Mes biens' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Studio des tests' })).toHaveCount(0);
    await goTo(page, 'Synthèse');
    await expect(
      page.getByRole('heading', { name: 'Synthèse · Appartement exemple' }),
    ).toBeVisible();
  });
});

test.describe('charger l’exemple (⚙ Paramètres)', () => {
  test('avec des données : confirmation (Annuler, Exporter d’abord, Remplacer)', async ({
    page,
  }, testInfo) => {
    await startEmpty(page);
    await createProperty(page, 'Studio des tests');
    await openSettings(page);
    const card = page.getByRole('main').locator('section', { hasText: 'Exemple' }).last();
    await expect(card).toContainText(
      'Remplace toutes les données par un appartement fictif, pour découvrir l’outil.',
    );
    await card.getByRole('button', { name: 'Charger l’exemple' }).click();

    const dialog = page.getByRole('dialog', { name: 'Remplacer tes données par l’exemple ?' });
    await expect(dialog).toContainText(
      'Tes données actuelles (1 bien, 0 opération, 0 échéance) seront effacées de ce navigateur. ' +
        'Tu pourras les retrouver seulement avec une sauvegarde.',
    );
    await capture(page, testInfo, 'it5a-confirmation-exemple', { fullPage: false });

    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole('button', { name: 'Charger l’exemple' }).click();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Exporter d’abord' }).click();
    await download;
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Remplacer' }).click();
    await expect(page.getByText('Exemple chargé.')).toBeVisible();
    await goTo(page, 'Accueil');
    await expect(page.getByRole('region', { name: 'Appartement exemple' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Studio des tests' })).toHaveCount(0);
  });

  test('l’exemple chargé, la confirmation donne ses compteurs', async ({ page }) => {
    await startWithTestData(page);
    await openSettings(page);
    await page.getByRole('button', { name: 'Charger l’exemple' }).click();
    await expect(page.getByRole('dialog')).toContainText(
      'Tes données actuelles (1 bien, 289 opérations, 240 échéances)',
    );
  });

  test('sans données, l’exemple se charge directement', async ({ page }) => {
    await page.goto('/');
    await expect(welcome(page)).toBeVisible();
    await openSettings(page);
    await page.getByRole('button', { name: 'Charger l’exemple' }).click();
    await expect(page.getByText('Exemple chargé.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('rappel de sauvegarde', () => {
  const banner = (page: Page) => page.getByRole('status', { name: 'Rappel de sauvegarde' });

  test('16 jours après la dernière sauvegarde, puis masqué après « Exporter »', async ({
    page,
  }, testInfo) => {
    // Charger l'exemple compte comme une sauvegarde (le 01/11/2026).
    await startWithTestData(page);
    await expect(banner(page)).toHaveCount(0);
    await daysLater(page, 15);
    await expect(page.getByRole('heading', { name: 'Mes biens' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await daysLater(page, 16);
    await expect(banner(page)).toContainText('Dernière sauvegarde il y a 16 jours.');
    const button = banner(page).getByRole('button', { name: 'Exporter' });
    if (isPhone(testInfo)) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalScroll(page);
    await capture(page, testInfo, 'it5a-rappel-sauvegarde');

    // Seulement sur l'Accueil.
    await goTo(page, 'Synthèse');
    await expect(banner(page)).toHaveCount(0);
    await goTo(page, 'Accueil');

    const download = page.waitForEvent('download');
    await button.click();
    expect((await download).suggestedFilename()).toMatch(/^locapilote-sauvegarde-.*\.json$/);
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mes biens' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('jamais exporté : rappel quand les premières données ont plus de 15 jours', async ({
    page,
  }) => {
    await startEmpty(page);
    await createProperty(page, 'Studio des tests');
    await goTo(page, 'Accueil');
    await expect(banner(page)).toHaveCount(0);
    await daysLater(page, 16);
    await expect(banner(page)).toContainText('Tu n’as pas encore exporté tes données.');
    // L'export depuis ⚙ Paramètres remet aussi le compteur à zéro.
    await openSettings(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter toutes mes données (JSON)' }).click();
    await download;
    await goTo(page, 'Accueil');
    await expect(page.getByRole('heading', { name: 'Mes biens' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });
});

test('un bien sans prêt : toutes les pages, sans erreur ni « NaN », puis un échéancier estimé', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await startEmpty(page);
  await page.getByLabel('Nom du bien *').fill('Studio sans prêt');
  await page.getByLabel('Régime fiscal').selectOption({ label: 'LMNP au réel' });
  await page.getByLabel('Date d’acquisition *').fill('2022-03-15');
  await page.getByLabel('Date de mise en location').fill('2023-01-01');
  await page.getByLabel('Prix d’achat net vendeur (€)').fill('150000');
  await page.getByText('Plus de détails (loyer, gestion, valeur estimée)').click();
  await page.getByLabel('Valeur estimée (€)').fill('170000');
  await page.getByRole('button', { name: 'Créer le bien' }).click();
  await expect(page.getByText('Bien « Studio sans prêt » créé.')).toBeVisible();

  const main = page.getByRole('main');
  const checkPages = async () => {
    for (const [label, heading] of [
      ['Synthèse', 'Synthèse · Studio sans prêt'],
      ['Budget', 'Budget · Studio sans prêt'],
      ['Simulations', 'Simulations · Studio sans prêt'],
      ['Fiscalité', 'Fiscalité · Studio sans prêt'],
    ] as const) {
      await goTo(page, label);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(main).not.toContainText(/NaN|undefined|Infinity/);
    }
  };
  await checkPages();

  // Budget : une ligne Prêt à 0.
  await goTo(page, 'Budget');
  const loanRow = main.getByText('Prêt (échéances)').filter({ visible: true }).first();
  await expect(loanRow).toBeVisible();
  // Simulations : un scénario de vente, sans capital restant dû.
  await goTo(page, 'Simulations');
  await expect(main).toContainText('170 000 €');
  // Pas de « -0 € » (zéro négatif) quand rien n'est payé de sa poche.
  await expect(main).not.toContainText(/-0 €|−0 €/);

  await goToProperty(page, 'Prêt');
  await expect(main).not.toContainText(/NaN|undefined/);
  await page.getByRole('button', { name: 'Ajouter un prêt' }).click();
  await page.getByLabel('Banque *').fill('Banque test');
  await page.getByLabel('Montant emprunté (€) *').fill('120000');
  await page.getByLabel('Taux annuel (%) *').fill('3,2');
  await page.getByLabel('Durée (mois) *').fill('240');
  await page.getByLabel('Première échéance *').fill('2022-04-05');
  await page.getByRole('button', { name: 'Créer le prêt' }).click();
  await page.getByRole('button', { name: 'Générer un échéancier estimé' }).click();
  await expect(page.getByText('Échéancier estimé généré : 240 échéances.')).toBeVisible();
  await checkPages();
  expect(errors).toEqual([]);
});

test.describe('finitions sur téléphone', () => {
  test('intertitres de la Fiscalité en petites capitales bleues, comme la Synthèse', async ({
    page,
  }, testInfo) => {
    test.skip(!isPhone(testInfo), 'cartes de la Fiscalité : téléphone seulement');
    await startWithTestData(page);
    await goTo(page, 'Fiscalité');
    const title = page
      .getByRole('region', { name: 'Fiscalité 2025' })
      .getByRole('heading', { name: 'Recettes imposables' });
    await goTo(page, 'Synthèse');
    await expect(
      page.getByRole('heading', { name: 'Synthèse · Appartement exemple' }),
    ).toBeVisible();
    const reference = page.locator('.year-card h4.section-title').filter({ visible: true }).first();
    const style = (el: typeof title) =>
      el.evaluate((node) => {
        const s = getComputedStyle(node);
        return [s.color, s.textTransform, s.fontSize, s.fontWeight].join(' ');
      });
    const expectedStyle = await style(reference);
    await goTo(page, 'Fiscalité');
    await expect(title).toBeVisible();
    expect(await style(title)).toBe(expectedStyle);
    expect(expectedStyle).toContain('uppercase');
  });

  test('pas de sous-titre « Piloter un logement en location » sur téléphone', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const tagline = page.getByText('Piloter un logement en location');
    if (isPhone(testInfo)) await expect(tagline).toBeHidden();
    else await expect(tagline).toBeVisible();
  });
});
