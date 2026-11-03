/**
 * Recette US11 (recentrée) : Simulations › Vente répond à « combien je touche, combien d'impôt,
 * ai-je intérêt à attendre ». Chiffres comparés à data/expected.json (bloc « vendre_quand »).
 */
import type { Page } from '@playwright/test';
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

/** La carte du scénario affiché. */
const card = (page: Page) => page.getByRole('region', { name: 'Scénario affiché' });

async function goToSale(page: Page): Promise<void> {
  await goTo(page, 'Simulations');
  await expect(
    page.getByRole('heading', { name: 'Simulations · Appartement exemple' }),
  ).toBeVisible();
  await expect(card(page)).toBeVisible();
}

/** Ajoute un scénario de comparaison (date ISO, prix en euros). */
async function compareWith(page: Page, date: string, price: string): Promise<void> {
  await page.getByRole('button', { name: 'Comparer avec une autre date' }).click();
  const form = page.getByRole('form', { name: 'Scénario de vente' });
  await form.getByLabel('Date de vente *').fill(date);
  await form.getByLabel('Prix de vente net vendeur (€) *').fill(price);
  await form.getByRole('button', { name: 'Ajouter le scénario' }).click();
  const [y, m, d] = date.split('-');
  await expect(page.getByText(`Scénario du ${d}/${m}/${y} ajouté.`)).toBeVisible();
}

/** Ouvre un détail replié (⊕) de la carte, s'il est fermé. */
async function open(page: Page, label: string): Promise<void> {
  const button = card(page).getByRole('button', { name: label, exact: true });
  if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

/** Valeur d'une ligne d'un détail de la carte. */
function line(page: Page, label: string) {
  return card(page)
    .locator('.year-lines > div')
    .filter({ has: page.locator('dt').getByText(label, { exact: true }) })
    .locator('dd');
}

test('le jeu de test : un seul scénario, somme nette et impôt en avant', async ({
  page,
}, testInfo) => {
  await startWithTestData(page);
  await goToSale(page);
  const c = card(page);
  await expect(c.getByRole('heading', { level: 3 })).toHaveText(
    'Si tu vends le 30/06/2027 à 279 000,00 €',
  );
  await expect(c.getByTestId('somme-nette')).toHaveText(eur(num('Somme nette perçue', 0)));
  await expect(c.getByTestId('impot')).toHaveText(eur(0));
  // Remploi : condition des 4 ans non remplie le 30/06/2027.
  await expect(c.getByTestId('remploi')).toHaveText('Exonération possible à partir du 01/11/2027');
  // Cash-flow à remettre d'ici la vente : 2 515,02 € sur 8 mois.
  await expect(c.getByTestId('cash-flow')).toContainText(
    `${eur(-num('Cash-flow à remettre de votre poche (total)', 0))} à remettre d’ici la vente (${eur(-num('Soit par mois', 0))}/mois)`,
  );
  // Un seul scénario : pas de tableau de comparaison.
  await expect(page.getByLabel('Comparaison des dates de vente')).toHaveCount(0);

  // Détails et paramètres repliés par défaut.
  for (const label of ['Calcul', 'Somme perçue', 'Calcul de la plus-value']) {
    await expect(c.getByRole('button', { name: label, exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }
  const settings = page.getByRole('region', { name: 'Paramètres de vente' });
  await expect(settings.getByRole('button', { name: 'Paramètres de vente' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(settings.getByTestId('resume-parametres')).toHaveText(
    /Frais d’agence 0,00\s%\s· frais divers de vente 1\s674,00\s€ · indemnités de remboursement anticipé 0,00\s€/,
  );
  // Sortis de l'écran : TRI, gain total, placement, loyer évité, autres dettes.
  const main = page.getByRole('main');
  for (const text of ['TRI', 'Gain total', 'placement', 'Loyer évité', 'Autres dettes']) {
    await expect(main.getByText(text)).toHaveCount(0);
  }
  // Mentions.
  await expect(
    page.getByText(/pas un conseil fiscal ni un conseil en investissement/),
  ).toBeVisible();
  await expect(page.getByText(/à confirmer avec un notaire/)).toBeVisible();
  if (isPhone(testInfo)) await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'us11-scenario-jeu-de-test');
});

test('sans scénario : vente dans 12 mois à la valeur estimée, sinon invitation à la saisir', async ({
  page,
}, testInfo) => {
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

  await goTo(page, 'Simulations');
  // Horloge figée au 01/11/2026 : vente le 01/11/2027.
  await expect(card(page).getByRole('heading', { level: 3 })).toHaveText(
    'Si tu vends le 01/11/2027 à 180 000,00 €',
  );
  // Le scénario par défaut est enregistré : il reste après rechargement.
  await page.reload();
  await expect(card(page).getByRole('heading', { level: 3 })).toHaveText(
    'Si tu vends le 01/11/2027 à 180 000,00 €',
  );
  await capture(page, testInfo, 'us11-scenario-par-defaut');
});

test('comparer avec d’autres dates : tableau, gain de l’attente, modifier, supprimer', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await startWithTestData(page);
  await goToSale(page);
  await compareWith(page, '2028-06-30', '279000');
  await compareWith(page, '2029-06-30', '279000');

  // Le dernier ajouté s'affiche dans la carte.
  await expect(card(page).getByRole('heading', { level: 3 })).toHaveText(
    'Si tu vends le 30/06/2029 à 279 000,00 €',
  );
  await expect(card(page).getByTestId('somme-nette')).toHaveText(eur(num('Somme nette perçue', 2)));
  await expect(card(page).getByTestId('impot')).toHaveText(eur(num('Impôt sur la plus-value', 2)));

  const comparison = page.getByLabel('Comparaison des dates de vente').filter({ visible: true });
  await expect(comparison).toBeVisible();
  // Gain de l'attente 2027 → 2028 : 8 131,59 € de somme nette en plus − 2 855,07 € remis.
  await expect(comparison).toContainText(
    `attendre jusqu’au 30/06/2028 te rapporte ${eur(5276.52)} de plus`,
  );
  await expect(comparison).toContainText(
    /attendre jusqu’au 30\/06\/2029 te rapporte 4\s730,1\d\s€ de plus/,
  );
  if (phone) {
    await expect(comparison.getByRole('listitem')).toHaveCount(3);
    await expect(comparison.getByRole('listitem').first()).toContainText(
      eur(num('Somme nette perçue', 0)),
    );
  } else {
    const rows = comparison.locator('tbody tr');
    await expect(rows).toHaveCount(3);
    const second = rows.nth(1);
    await expect(second).toContainText(eur(num('Somme nette perçue', 1)));
    await expect(second).toContainText(eur(num('Impôt sur la plus-value', 1)));
    await expect(second).toContainText(eur(-num('Cash-flow à remettre de votre poche (total)', 1)));
  }
  if (phone) await expectNoHorizontalScroll(page);
  await capture(page, testInfo, 'us11-comparaison');

  // Un clic sur une ligne l'affiche dans la carte.
  await comparison.getByRole('button', { name: 'Afficher le scénario du 30/06/2028' }).click();
  await expect(card(page).getByRole('heading', { level: 3 })).toHaveText(
    'Si tu vends le 30/06/2028 à 279 000,00 €',
  );
  await expect(card(page).getByTestId('remploi')).toContainText(
    `Exonéré si tu réinvestis dans ta résidence principale (impôt évité : ${eur(num('Impôt évité si le prix est réinvesti', 1))})`,
  );

  // Modifier : le prix passe à 290 000 €.
  await page
    .getByRole('button', { name: 'Modifier le scénario du 30/06/2028' })
    .filter({ visible: true })
    .first()
    .click();
  const form = page.getByRole('form', { name: 'Scénario de vente' });
  await expect(form.getByLabel('Prix de vente net vendeur (€) *')).toHaveValue('279000');
  await form.getByLabel('Prix de vente net vendeur (€) *').fill('290000');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Scénario du 30/06/2028 modifié.')).toBeVisible();
  await expect(card(page).getByRole('heading', { level: 3 })).toHaveText(
    'Si tu vends le 30/06/2028 à 290 000,00 €',
  );

  // Supprimer (confirmation acceptée), et la suppression est enregistrée. Sur téléphone, les
  // boutons sont dans la carte du scénario affiché : on affiche d'abord celui à supprimer.
  await comparison.getByRole('button', { name: 'Afficher le scénario du 30/06/2029' }).click();
  await page
    .getByRole('button', { name: 'Supprimer le scénario du 30/06/2029' })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByText('Scénario du 30/06/2029 supprimé.')).toBeVisible();
  await page.reload();
  await expect(comparison).toBeVisible();
  await expect(comparison).not.toContainText('30/06/2029');
  await expect(comparison).toContainText('30/06/2028');
});

test('les détails ⊕ : somme perçue, plus-value, valeurs calculées', async ({ page }, testInfo) => {
  await startWithTestData(page);
  await goToSale(page);
  await compareWith(page, '2028-06-30', '279000');

  await open(page, 'Somme perçue');
  await expect(line(page, '− Capital restant dû')).toHaveText(eur(num('− Capital restant dû', 1)));
  await expect(line(page, '− Frais divers de vente')).toHaveText(eur(-1674));

  await open(page, 'Calcul de la plus-value');
  const r = expected.revente as Record<string, number>;
  await expect(line(page, 'Durée de détention')).toHaveText('10 ans');
  await expect(line(page, 'Prix d’achat du logement (hors mobilier)')).toHaveText(
    eur(r["Prix d'acquisition du logement (hors mobilier)"]!),
  );
  await expect(line(page, '+ Frais d’acquisition (réels ou forfait 7,5 %)')).toHaveText(
    eur(r["+ Frais d'acquisition (réels ou forfait 7,5 %, le plus élevé)"]!),
  );
  await expect(line(page, '− Amortissements déduits à réintégrer')).toHaveText(
    eur(num('− Amortissements déduits (années avant celle de la vente)', 1)),
  );
  await expect(
    card(page).getByText(
      'Inclut les amortissements de tous les composants (mobilier, équipements, travaux) ; selon la notice 2048-IMM, seuls ceux du logement sont à réintégrer : à confirmer avec le notaire.',
    ),
  ).toBeVisible();
  await expect(line(page, 'Plus-value brute')).toHaveText(eur(num('Plus-value brute', 1)));
  // Années futures : la valeur du jeu de test (4 185 €) est une valeur modifiée.
  await expect(
    card(page).getByLabel('Amortissements déduits par an, années futures (€)'),
  ).toHaveValue('4185');
  await expect(
    card(page).getByText(/Valeur modifiée \(calcul automatique : 7\s307,73\s€\)/),
  ).toBeVisible();

  await open(page, 'Calcul');
  await expect(card(page).getByLabel('Loyer net projeté (€ / mois)')).toHaveValue('1056,61');
  await expect(
    card(page).getByText(/Valeur modifiée \(calcul automatique : 1\s160,06\s€\)/),
  ).toBeVisible();
  await expect(card(page).getByText(/Honoraires du comptable de 2025/)).toBeVisible();
  // Dépenses projetées : ce qui est exclu est indiqué ; calcul automatique 7 782,55 €/an.
  await expect(
    card(page).getByText(
      /Exclues : dépenses immobilisées \(« À amortir »\) et catégories de travaux, y compris travaux de copropriété\./,
    ),
  ).toBeVisible();
  await expect(
    card(page).getByText(/Valeur modifiée \(calcul automatique : 7\s782,55\s€\)/),
  ).toBeVisible();
  await capture(page, testInfo, 'us11-details');

  // Vider un champ revient au calcul automatique : le cash-flow d'ici la vente change.
  const before = await card(page).getByTestId('cash-flow').textContent();
  await card(page).getByLabel('Loyer net projeté (€ / mois)').fill('');
  await card(page).getByLabel('Loyer net projeté (€ / mois)').press('Enter');
  await expect(card(page).getByText(/^Calcul automatique : 1\s160,06\s€/)).toBeVisible();
  await expect(card(page).getByTestId('cash-flow')).not.toHaveText(before!);
});

test('remploi : part du prix réinvestie modifiable dans la ligne', async ({ page }) => {
  await startWithTestData(page);
  await goToSale(page);
  await compareWith(page, '2028-06-30', '279000');
  const share = card(page).getByLabel('Part du prix réinvestie (%)');
  await expect(share).toHaveValue('100');
  await share.fill('50');
  await share.press('Enter');
  // Impôt de 356,83 € : la moitié est évitée.
  await expect(card(page).getByTestId('remploi')).toContainText(`impôt évité : ${eur(178.42)}`);
});

test('paramètres de vente : repliés, modifiables, la somme nette suit', async ({
  page,
}, testInfo) => {
  await startWithTestData(page);
  await goToSale(page);
  const settings = page.getByRole('region', { name: 'Paramètres de vente' });
  await settings.getByRole('button', { name: 'Paramètres de vente' }).click();
  const form = settings.getByRole('form', { name: 'Paramètres de vente' });
  await expect(form.getByRole('textbox')).toHaveCount(3);
  await expect(form.getByLabel('Frais divers de vente (€)')).toHaveValue('1674');
  await form.getByLabel('Frais divers de vente (€)').fill('2674');
  await form.getByRole('button', { name: 'Enregistrer les paramètres' }).click();
  await expect(page.getByText('Paramètres de vente enregistrés.')).toBeVisible();
  await expect(card(page).getByTestId('somme-nette')).toHaveText(
    eur(num('Somme nette perçue', 0) - 1000),
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
