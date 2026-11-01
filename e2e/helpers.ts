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

/**
 * Va sur une page par le menu : la barre de navigation (en bas de l'écran sur téléphone), ou,
 * pour les entrées qui n'y sont pas sur téléphone (« Mon bien », « ⚙ Paramètres »), le menu ☰.
 */
export async function goTo(page: Page, label: string): Promise<void> {
  if (label === 'Paramètres') return openSettings(page);
  const link = page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: label, exact: true });
  if (await link.isVisible()) return link.click();
  await openPhoneMenu(page);
  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('link', { name: label, exact: true })
    .click();
}

/** Ouvre le menu ☰ (téléphone). */
export async function openPhoneMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Menu' })).toBeVisible();
}

/** Ouvre ⚙ Paramètres (données) : l'icône en haut à droite, ou le menu ☰ sur téléphone. */
export async function openSettings(page: Page): Promise<void> {
  const gear = page.getByRole('link', { name: 'Paramètres', exact: true });
  if (await gear.isVisible()) return gear.click();
  await openPhoneMenu(page);
  await page
    .getByRole('navigation', { name: 'Menu' })
    .getByRole('link', { name: '⚙ Paramètres' })
    .click();
}

/** Ouvre une section de « Mon bien » : Informations, Prêt ou Immobilisations. */
export async function goToProperty(
  page: Page,
  section: 'Informations' | 'Prêt' | 'Immobilisations',
): Promise<void> {
  await goTo(page, 'Mon bien');
  await page
    .getByRole('navigation', { name: 'Sections du bien' })
    .getByRole('link', { name: section, exact: true })
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
export async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: { fullPage?: boolean } = {},
): Promise<void> {
  const fullPage = options.fullPage ?? true;
  const path = join('e2e-captures', testInfo.project.name, `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  const body = await page.screenshot({ path, fullPage });
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

const euroFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const percentFormat = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const monthsFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234.5 → « 1 234,50 € », comme à l'écran. */
export function eur(value: number): string {
  return euroFormat.format(Math.round(value * 100) / 100);
}

/** 0.045922 → « 4,59 % » */
export function pct(value: number): string {
  return percentFormat.format(value);
}

/** Mois de location, toujours deux décimales : 7.49589 → « 7,50 » */
export function months(value: number): string {
  return monthsFormat.format(value);
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

/** Ouvre un détail replié (⊕) de la synthèse, s'il est fermé. */
export async function openDetail(page: Page, label: string): Promise<void> {
  const button = page
    .getByRole('button', { name: label, exact: true })
    .filter({ visible: true })
    .first();
  if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

/** « −1 234,56 € » → -1234.56 */
export function parseEur(text: string): number {
  const cleaned = text
    .replace(/[^\d,−-]/g, '')
    .replace('−', '-')
    .replace(',', '.');
  return Number(cleaned);
}
