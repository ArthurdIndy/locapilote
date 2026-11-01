import { expect, test as base, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import seed from '../data/seed.json' with { type: 'json' };
import expected from '../data/expected.json' with { type: 'json' };

export { expected, seed };

/** Date du jour figée pour tous les parcours : les écrans « au [aujourd'hui] » sont stables. */
export const TODAY = '2026-11-01';

/**
 * `test` de Playwright, avec l'horloge figée au 01/11/2026 et toutes les fenêtres de
 * confirmation acceptées (sauf si le test en décide autrement).
 */
export const test = base.extend<{ acceptDialogs: boolean }>({
  acceptDialogs: [true, { option: true }],
  page: async ({ page, acceptDialogs }, use) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    if (acceptDialogs) page.on('dialog', (d) => void d.accept());
    await use(page);
  },
});

export { expect };

/** Vrai pour le projet « téléphone ». */
export function isPhone(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'telephone';
}

/** Premier lancement avec le jeu de test. */
export async function startWithTestData(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /Commencer avec le jeu de test/ }).click();
  await expect(page.getByRole('heading', { name: 'Appartement exemple' })).toBeVisible();
}

/** Premier lancement à vide : on arrive sur la création d'un bien. */
export async function startEmpty(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /Démarrer vide/ }).click();
  await expect(page.getByRole('heading', { name: 'Nouveau bien' })).toBeVisible();
}

/** Crée un bien minimal depuis le formulaire (déjà ouvert). */
export async function createProperty(
  page: Page,
  name: string,
  options: { rentalStart?: string } = {},
): Promise<void> {
  await page.getByLabel('Nom du bien *').fill(name);
  await page.getByLabel('Régime fiscal').selectOption({ label: 'LMNP au réel' });
  await page.getByLabel('Date d’acquisition *').fill('2020-03-15');
  if (options.rentalStart)
    await page.getByLabel('Date de mise en location').fill(options.rentalStart);
  await page.getByLabel('Prix d’achat net vendeur (€)').fill('150000');
  await page.getByRole('button', { name: 'Créer le bien' }).click();
  await expect(page.getByText(`Bien « ${name} » créé.`)).toBeVisible();
}

/** Va sur une page par le menu. */
export async function goTo(page: Page, label: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: label, exact: true })
    .click();
}

/** La page ne défile pas horizontalement (rien ne dépasse de l'écran). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Capture d'écran pour la recette : jointe au rapport Playwright et copiée dans
 * `e2e-captures/<projet>/<nom>.png`.
 */
export async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = join('e2e-captures', testInfo.project.name, `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  const body = await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

const euroFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const percentFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const decimalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** 1234.5 → « 1 234,50 € », comme à l'écran. */
export function eur(value: number): string {
  return euroFormat.format(Math.round(value * 100) / 100);
}

/** 0.045922 → « 4,59 % » */
export function pct(value: number): string {
  return percentFormat.format(value);
}

/** 7.49589 → « 7,5 » */
export function dec(value: number): string {
  return decimalFormat.format(value);
}

/** Le tableau de la banque du jeu de test, tel qu'on le copie depuis Excel (tabulations). */
export function bankTableAsPasted(): string {
  const fr = (n: number) => n.toFixed(2).replace('.', ',');
  const lines = seed.echeances_pret.map((e) =>
    [
      e.date.split('-').reverse().join('/'),
      fr(e.capital_du_avant),
      fr(e.capital),
      fr(e.interets),
      fr(e.assurance),
    ].join('\t'),
  );
  return ['Date\tCapital dû\tCapital\tIntérêts\tAssurance', ...lines].join('\n');
}
