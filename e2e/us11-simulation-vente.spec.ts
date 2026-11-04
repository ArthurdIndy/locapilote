/**
 * Recette US11 : Simulations › Vente, au modèle de la Synthèse (une colonne par scénario, une
 * carte sur téléphone). Chiffres comparés à data/expected.json (bloc « vendre_quand »).
 */
import type { Locator, Page } from '@playwright/test';
import {
  capture,
  createProperty,
  eur,
  expect,
  expected,
  expectNoHorizontalScroll,
  goTo,
  goToProperty,
  isPhone,
  openSettings,
  startEmpty,
  startWithTestData,
  test,
} from './helpers';

type Column = (string | number)[];
const vq = expected.vendre_quand as Record<string, Column>;
const num = (label: string, i: number) => vq[label]![i] as number;

const euroRounded = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
/** Montant du tableau, arrondi à l'euro : 182343.65 → « 182 344 € ». */
const eur0 = (value: number) => euroRounded.format(Math.round(value));

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s\u202f\u00a0]/g, '\\s');
}

/**
 * Valeur d'une ligne pour un scénario : colonne `col` du tableau (dans l'ordre affiché), ou
 * carte du scénario daté `date` sur téléphone.
 */
function cell(page: Page, phone: boolean, label: string, col: number, date: string): Locator {
  const labelText = new RegExp(`^${escapeRegExp(label)}[⊕⊖]?$`);
  if (phone) {
    return page
      .getByRole('region', { name: `Scénario du ${date}` })
      .locator('.year-lines > div')
      .filter({ has: page.locator('dt').getByText(labelText) })
      .locator('dd');
  }
  return page
    .locator('table[aria-label="Simulation de vente"] tbody tr')
    .filter({ has: page.getByRole('rowheader', { name: labelText }) })
    .locator('td')
    .nth(col);
}

async function goToSale(page: Page): Promise<void> {
  await goTo(page, 'Simulations');
  await expect(
    page.getByRole('heading', { name: 'Simulations · Appartement exemple' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vente', exact: true })).toBeVisible();
}

/** Ajoute un scénario par « + Autre date » (date ISO, prix en euros). */
async function addDate(page: Page, date: string, price: string): Promise<void> {
  await page.getByRole('button', { name: '+ Autre date' }).filter({ visible: true }).click();
  const form = page.getByRole('form', { name: 'Scénario de vente' });
  await form.getByLabel('Date de vente *').fill(date);
  await form.getByLabel('Prix de vente net vendeur (€) *').fill(price);
  await form.getByRole('button', { name: 'Ajouter le scénario' }).click();
  const [y, m, d] = date.split('-');
  await expect(page.getByText(`Scénario du ${d}/${m}/${y} ajouté.`)).toBeVisible();
}

/** Ouvre un détail replié (⊕), s'il est fermé (même état pour le tableau et les cartes). */
async function openDetail(page: Page, label: string): Promise<void> {
  const button = page
    .getByRole('button', { name: label, exact: true })
    .filter({ visible: true })
    .first();
  if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

/** Ouvre le menu ✎ d'un scénario (en-tête de colonne ou de carte) et choisit une action. */
async function columnAction(page: Page, date: string, action: 'Modifier' | 'Supprimer') {
  await page
    .getByRole('button', { name: `Modifier ou supprimer le scénario du ${date}` })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole('menu', { name: `Scénario du ${date}` })
    .getByRole('menuitem', { name: action })
    .click();
}

test('le jeu de test : une colonne, une ligne par chiffre, détails repliés', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToSale(page);
  const d = '30/06/2027';
  if (!phone) {
    await expect(
      page.locator('table[aria-label="Simulation de vente"] thead th').nth(1),
    ).toContainText(d);
  }
  await expect(cell(page, phone, 'Prix', 0, d)).toHaveText(eur0(279000));
  await expect(cell(page, phone, 'Somme nette perçue', 0, d)).toHaveText(
    eur0(num('Somme nette perçue', 0)),
  );
  await expect(cell(page, phone, 'Impôt sur la plus-value', 0, d)).toHaveText(eur0(0));
  await expect(cell(page, phone, 'Avec remploi', 0, d)).toHaveText('dès le 01/11/2027');
  await expect(cell(page, phone, 'À remettre d’ici la vente', 0, d)).toHaveText(
    eur0(-num('Cash-flow à remettre de votre poche (total)', 0)),
  );
  const waitingLabel = phone ? 'Attendre' : 'Attendre depuis la colonne précédente';
  await expect(cell(page, phone, waitingLabel, 0, d)).toHaveText('—');

  // Détails et paramètres repliés par défaut.
  for (const label of [
    'Somme nette perçue',
    'Impôt sur la plus-value',
    'Avec remploi',
    'À remettre d’ici la vente',
    'Paramètres de vente',
  ]) {
    await expect(
      page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first(),
    ).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(page.getByTestId('resume-parametres')).toHaveText(
    /Frais d’agence 0,00\s%\s· frais divers de vente 1\s674,00\s€ · indemnités de remboursement anticipé 0,00\s€/,
  );
  await expect(
    page.getByText('Estimation, pas un conseil fiscal : à confirmer avec un notaire.'),
  ).toBeVisible();
  // Retirés : budget annoncé, TRI, gain total, placement, loyer évité, autres dettes.
  const main = page.getByRole('main');
  for (const text of ['Budget prévisionnel', 'TRI', 'Gain total', 'placement', 'Loyer évité']) {
    await expect(main.getByText(text)).toHaveCount(0);
  }
  if (phone) await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'us11-scenario-jeu-de-test');
});

test('sans scénario : vente dans 12 mois à la valeur estimée, sinon invitation à la saisir', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startEmpty(page);
  await createProperty(page, 'Studio des tests', { rentalStart: '2021-01-01' });
  await goTo(page, 'Simulations');
  await expect(page.getByText(/Indique la valeur estimée du bien/)).toBeVisible();

  await goToProperty(page, 'Informations');
  await page.getByRole('button', { name: 'Modifier' }).click();
  await page.getByText('Plus de détails').click();
  await page.getByLabel('Valeur estimée (€)').fill('180000');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Bien « Studio des tests » modifié.')).toBeVisible();

  // Horloge figée au 01/11/2026 : vente le 01/11/2027, enregistrée (elle reste au rechargement).
  await goTo(page, 'Simulations');
  await expect(cell(page, phone, 'Prix', 0, '01/11/2027')).toHaveText(eur0(180000));
  await page.reload();
  await expect(cell(page, phone, 'Prix', 0, '01/11/2027')).toHaveText(eur0(180000));
  await capture(page, testInfo, 'us11-scenario-par-defaut');
});

test('ajouter, modifier, supprimer depuis l’en-tête ; attendre depuis la colonne précédente', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToSale(page);
  await addDate(page, '2028-06-30', '279000');
  await addDate(page, '2029-06-30', '279000');
  const dates = ['30/06/2027', '30/06/2028', '30/06/2029'];

  for (const [i, d] of dates.entries()) {
    await expect(cell(page, phone, 'Somme nette perçue', i, d)).toHaveText(
      eur0(num('Somme nette perçue', i)),
    );
    await expect(cell(page, phone, 'Impôt sur la plus-value', i, d)).toHaveText(
      eur0(num('Impôt sur la plus-value', i)),
    );
    await expect(cell(page, phone, 'À remettre d’ici la vente', i, d)).toHaveText(
      eur0(-num('Cash-flow à remettre de votre poche (total)', i)),
    );
  }
  await expect(cell(page, phone, 'Avec remploi', 1, dates[1]!)).toHaveText(
    eur0(num('Somme nette avec remploi', 1)),
  );
  // Attendre : 5 276,52 € puis 4 730,15 € (onglet Vendre quand), arrondis à l'euro, en vert.
  const waiting = (i: number) =>
    cell(
      page,
      phone,
      phone ? `Attendre depuis le ${dates[i - 1]}` : 'Attendre depuis la colonne précédente',
      i,
      dates[i]!,
    );
  await expect(waiting(1)).toHaveText(`+ ${eur0(5276.52)}`);
  await expect(waiting(1)).toHaveClass(/positive/);
  await expect(waiting(2)).toHaveText(`+ ${eur0(4730.15)}`);
  if (!phone) {
    await expect(
      page.getByRole('rowheader', { name: 'Attendre depuis la colonne précédente' }),
    ).toHaveAttribute(
      'title',
      'Somme nette en plus, moins ce que tu remets en plus entre les deux dates, à prix de vente égal.',
    );
  }
  if (phone) await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'us11-comparaison');

  // Modifier depuis l'en-tête : le prix du 30/06/2028 passe à 290 000 €.
  await columnAction(page, dates[1]!, 'Modifier');
  const form = page.getByRole('form', { name: 'Scénario de vente' });
  await expect(form.getByLabel('Prix de vente net vendeur (€) *')).toHaveValue('279000');
  await form.getByLabel('Prix de vente net vendeur (€) *').fill('290000');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Scénario du 30/06/2028 modifié.')).toBeVisible();
  await expect(cell(page, phone, 'Prix', 1, dates[1]!)).toHaveText(eur0(290000));

  // Supprimer depuis l'en-tête (confirmation acceptée) ; la suppression est enregistrée.
  await columnAction(page, dates[2]!, 'Supprimer');
  await expect(page.getByText('Scénario du 30/06/2029 supprimé.')).toBeVisible();
  await page.reload();
  await expect(cell(page, phone, 'Prix', 1, dates[1]!)).toHaveText(eur0(290000));
  if (phone) {
    await expect(page.getByRole('region', { name: /^Scénario du / })).toHaveCount(2);
  } else {
    await expect(page.locator('table[aria-label="Simulation de vente"] thead th')).toHaveCount(4);
  }
});

test('les détails ⊕ : somme perçue, plus-value, à remettre d’ici la vente', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToSale(page);
  await addDate(page, '2028-06-30', '279000');
  const [d0, d1] = ['30/06/2027', '30/06/2028'];

  // Somme nette perçue : détail au centime.
  await openDetail(page, 'Somme nette perçue');
  await expect(cell(page, phone, '− Capital restant dû', 1, d1)).toHaveText(
    eur(num('− Capital restant dû', 1)),
  );
  await expect(cell(page, phone, '− Frais divers de vente', 0, d0)).toHaveText(eur(-1674));

  // Impôt sur la plus-value : détail, note sur les amortissements, valeur modifiée.
  await openDetail(page, 'Impôt sur la plus-value');
  await expect(cell(page, phone, 'Durée de détention', 1, d1)).toHaveText('10 ans');
  await expect(cell(page, phone, '− Amortissements déduits à réintégrer', 1, d1)).toHaveText(
    eur(num('− Amortissements déduits (années avant celle de la vente)', 1)),
  );
  await expect(cell(page, phone, 'Plus-value brute', 1, d1)).toHaveText(
    eur(num('Plus-value brute', 1)),
  );
  await expect(
    page
      .getByText(/seuls ceux du logement sont à réintégrer : à confirmer avec le notaire\./)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  // À remettre d'ici la vente : rythme mensuel hors frais de l'année de la vente.
  await openDetail(page, 'À remettre d’ici la vente');
  // (2 515,02 − 558) / 8 mois ≈ 244,63 €/mois.
  await expect(cell(page, phone, 'Par mois (échéances − loyer net + dépenses)', 0, d0)).toHaveText(
    `soit ${eur(244.63)}/mois`,
  );
  await expect(cell(page, phone, 'Frais de l’année de la vente', 0, d0)).toHaveText(
    `+ ${eur(558)}`,
  );
  await expect(cell(page, phone, 'Capital remboursé (récupéré à la vente)', 0, d0)).toHaveText(
    `dont ${eur(num('Capital remboursé sur la période', 0))}`,
  );
  await expect(
    page
      .getByText(/Valeur modifiée \(calcul automatique : 7\s782,55\s€\)/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await capture(page, testInfo, 'us11-details');
});

test('remploi : part du prix réinvestie compacte, calculée ou modifiée', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToSale(page);
  await addDate(page, '2028-06-30', '279000');
  const d1 = '30/06/2028';
  await openDetail(page, 'Avec remploi');
  const share = page
    .getByLabel(`Part du prix réinvestie (%), vente du ${d1}`)
    .filter({ visible: true });
  const status = cell(page, phone, 'Part du prix réinvestie', 1, d1);

  // Le jeu de test garde 100 % comme valeur modifiée.
  await expect(share).toHaveValue('100');
  await expect(status).toContainText('modifié');
  await expect(
    page
      .getByText(
        'Seul l’argent du prix de vente compte : la part qui rembourse le prêt et un nouveau prêt n’entrent pas dans le calcul. À confirmer avec le notaire.',
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  // 50 % : la moitié de l'impôt de 356,83 € est évitée.
  await share.fill('50');
  await share.press('Enter');
  await expect(cell(page, phone, 'Impôt évité', 1, d1)).toHaveText(eur(178.42));
  await expect(cell(page, phone, 'Avec remploi', 1, d1)).toHaveText(eur0(190653.66));

  // Retour au calcul : ce qui reste après remboursement du prêt (68,8 %).
  await status.getByRole('button', { name: /Revenir au calcul automatique/ }).click();
  await expect(share).toHaveValue('68,8');
  await expect(status).toContainText('calculé');
  await expect(cell(page, phone, 'Impôt évité', 1, d1)).toHaveText(eur(245.54));
  await expect(cell(page, phone, 'Avec remploi', 1, d1)).toHaveText(eur0(190720.78));
  await capture(page, testInfo, 'us11-remploi');
});

test('deux scénarios à la même date : pas d’attente, tri par prix croissant', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToSale(page);
  await addDate(page, '2027-06-30', '300000');
  if (phone) {
    const cards = page.getByRole('region', { name: 'Scénario du 30/06/2027' });
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(eur0(279000));
    await expect(cards.nth(1)).toContainText(eur0(300000));
    await expect(
      cards
        .nth(1)
        .locator('.year-lines > div')
        .filter({ hasText: 'Attendre depuis le 30/06/2027' })
        .locator('dd'),
    ).toHaveText('—');
  } else {
    await expect(cell(page, phone, 'Prix', 0, '')).toHaveText(eur0(279000));
    await expect(cell(page, phone, 'Prix', 1, '')).toHaveText(eur0(300000));
    await expect(cell(page, phone, 'Attendre depuis la colonne précédente', 1, '')).toHaveText('—');
  }
  await capture(page, testInfo, 'us11-meme-date');
});

test('paramètres de vente : repliés, modifiables, la somme nette suit', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToSale(page);
  const settings = page.getByRole('region', { name: 'Paramètres de vente' });
  await settings.getByRole('button', { name: 'Paramètres de vente' }).click();
  const form = settings.getByRole('form', { name: 'Paramètres de vente' });
  await expect(form.getByRole('textbox')).toHaveCount(3);
  await form.getByLabel('Frais divers de vente (€)').fill('2674');
  await form.getByRole('button', { name: 'Enregistrer les paramètres' }).click();
  await expect(page.getByText('Paramètres de vente enregistrés.')).toBeVisible();
  await expect(cell(page, phone, 'Somme nette perçue', 0, '30/06/2027')).toHaveText(
    eur0(num('Somme nette perçue', 0) - 1000),
  );
  await expect(settings.getByTestId('resume-parametres')).toContainText(/2\s674,00\s€/);
  await capture(page, testInfo, 'us11-parametres-vente');
});

test('frais d’acquisition réels dans Mon bien ; Synthèse et ⚙ sans TRI ni placement', async ({
  page,
}, testInfo) => {
  await startWithTestData(page);
  await goToProperty(page, 'Informations');
  await expect(page.getByRole('region', { name: 'Informations du bien' })).toContainText(
    `Frais d’acquisition réels (plus-value)${eur(27900)}`,
  );
  await goTo(page, 'Synthèse');
  await expect(page.getByRole('heading', { name: 'Synthèse · Appartement exemple' })).toBeVisible();
  await expect(page.getByRole('main').getByText(/TRI|placement/)).toHaveCount(0);
  await openSettings(page);
  await expect(page.getByRole('main').getByText(/placement/i)).toHaveCount(0);
  await capture(page, testInfo, 'us11-synthese-sans-tri');
});
