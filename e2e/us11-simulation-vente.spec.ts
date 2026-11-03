/** Recette US11 : simulation de vente et rentabilité réelle (TRI, comparaison à un placement). */
import type { Locator, Page } from '@playwright/test';
import {
  capture,
  eur,
  expect,
  expected,
  expectNoHorizontalScroll,
  goTo,
  isPhone,
  openSettings,
  pct,
  startWithTestData,
  test,
} from './helpers';

type Column = (string | number)[];
const vq = expected.vendre_quand as Record<string, Column>;
const num = (label: string, i: number) => vq[label]![i] as number;

const SCENARIOS = ['30/06/2027', '30/06/2028', '30/06/2029'];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s\u202f\u00a0]/g, '\\s');
}

/** Valeur affichée d'une ligne pour un scénario (colonne du tableau, ou carte sur téléphone). */
function cell(page: Page, phone: boolean, label: string, scenario: string): Locator {
  const labelText = new RegExp(`^${escapeRegExp(label)}[⊕⊖]?$`);
  if (phone) {
    return page
      .getByRole('region', { name: `Scénario du ${scenario}` })
      .locator('.year-lines > div')
      .filter({ has: page.locator('dt').getByText(labelText) })
      .locator('dd');
  }
  const table = page.locator('table[aria-label="Scénarios de vente"]');
  return table
    .locator('tbody tr')
    .filter({ has: page.getByRole('rowheader', { name: labelText }) })
    .locator('td')
    .nth(SCENARIOS.indexOf(scenario));
}

async function goToSale(page: Page): Promise<void> {
  await goTo(page, 'Simulations');
  await expect(
    page.getByRole('heading', { name: 'Simulations · Appartement exemple' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vente', exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await startWithTestData(page);
});

test('les trois scénarios du jeu de test retombent sur expected.json', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  await goToSale(page);
  const checks: [string, (i: number) => string][] = [
    ['Somme nette perçue', (i) => eur(num('Somme nette perçue', i))],
    ['− Impôt sur la plus-value', (i) => eur(num('− Impôt sur la plus-value', i))],
    ['Somme nette avec remploi', (i) => eur(num('Somme nette avec remploi', i))],
    ['− Capital restant dû', (i) => eur(num('− Capital restant dû', i))],
    [
      'Cash-flow à remettre d’ici la vente',
      (i) => eur(num('Cash-flow à remettre de votre poche (total)', i)),
    ],
    ['Gain total depuis l’achat', (i) => eur(num("Gain total depuis l'achat", i))],
    [
      'TRI (rendement annuel de ton apport)',
      (i) => pct(num('TRI (rendement annuel de votre apport)', i)),
    ],
  ];
  for (const [i, scenario] of SCENARIOS.entries()) {
    for (const [label, value] of checks) {
      // « −0,00 € » s'affiche « 0,00 € ».
      await expect(cell(page, phone, label, scenario)).toHaveText(
        value(i).replace('-0,00', '0,00'),
      );
    }
  }
  // Rendement de l'attente (onglet Vendre quand) : 2,89 % puis 2,48 %.
  await expect(cell(page, phone, 'Rendement annuel de l’attente', SCENARIOS[1]!)).toHaveText(
    pct(0.0288581898093851),
  );
  await expect(cell(page, phone, 'Rendement annuel de l’attente', SCENARIOS[2]!)).toHaveText(
    pct(0.0248334201321662),
  );
  // Remploi : condition des 4 ans remplie à partir du 01/11/2027.
  await expect(cell(page, phone, 'Condition des 4 ans', SCENARIOS[0]!)).toHaveText(
    'Non (dès le 01/11/2027)',
  );
  await expect(cell(page, phone, 'Condition des 4 ans', SCENARIOS[1]!)).toHaveText('Oui');
  // Sans placement de référence, la comparaison invite à le renseigner.
  await expect(cell(page, phone, 'Gain par rapport au placement', SCENARIOS[0]!)).toHaveText(
    'à renseigner',
  );
  await expect(page.getByText(/renseigne son taux dans/)).toBeVisible();
  // Mentions.
  await expect(
    page.getByText(/pas un conseil fiscal ni un conseil en investissement/),
  ).toBeVisible();
  await expect(page.getByText(/à confirmer avec un notaire/)).toBeVisible();

  if (phone) {
    // Un scénario par carte.
    await expect(page.getByRole('region', { name: /^Scénario du / })).toHaveCount(3);
    await expectNoHorizontalScroll(page);
  }
  await capture(page, testInfo, 'us11-scenarios-jeu-de-test');
});

test('le détail du calcul de la plus-value se déplie (⊕)', async ({ page }, testInfo) => {
  const phone = isPhone(testInfo);
  await goToSale(page);
  const toggle = page
    .getByRole('button', { name: '− Impôt sur la plus-value', exact: true })
    .filter({ visible: true })
    .first();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(cell(page, phone, 'Plus-value brute', SCENARIOS[1]!)).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const r = expected.revente as Record<string, number>;
  await expect(cell(page, phone, 'Durée de détention', SCENARIOS[0]!)).toHaveText('9 ans');
  await expect(
    cell(page, phone, 'Prix d’achat du logement (hors mobilier)', SCENARIOS[0]!),
  ).toHaveText(eur(r["Prix d'acquisition du logement (hors mobilier)"]!));
  await expect(
    cell(page, phone, '+ Forfait travaux 15 % (plus de 5 ans)', SCENARIOS[0]!),
  ).toHaveText(eur(r['+ Forfait travaux 15 % (détention de plus de 5 ans)']!));
  await expect(
    cell(page, phone, '− Amortissements déduits à réintégrer', SCENARIOS[0]!),
  ).toHaveText(eur(r['− Amortissements déduits à réintégrer']!));
  // Note sous la ligne : le total des amortissements est réintégré (comme l'Excel).
  const note = page
    .getByText(
      'Inclut les amortissements de tous les composants (mobilier, équipements, travaux) ; selon la notice 2048-IMM, seuls ceux du logement sont à réintégrer : à confirmer avec le notaire.',
    )
    .filter({ visible: true });
  await expect(note).toHaveCount(phone ? 3 : 1);
  await expect(cell(page, phone, 'Plus-value brute', SCENARIOS[1]!)).toHaveText(
    eur(num('Plus-value brute', 1)),
  );
  await expect(
    cell(page, phone, 'Abattement pour durée de détention (impôt sur le revenu)', SCENARIOS[1]!),
  ).toHaveText(pct(0.3));
  await expect(
    cell(page, phone, 'Abattement pour durée de détention (prélèvements sociaux)', SCENARIOS[1]!),
  ).toHaveText(pct(0.0825));
  await capture(page, testInfo, 'us11-detail-plus-value');

  // Il se replie, et l'état est mémorisé.
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(cell(page, phone, 'Plus-value brute', SCENARIOS[1]!)).toHaveCount(0);
});

test('créer, modifier et supprimer un scénario de vente', async ({ page }, testInfo) => {
  const phone = isPhone(testInfo);
  await goToSale(page);

  // Créer.
  await page.getByRole('button', { name: 'Ajouter un scénario' }).click();
  const form = page.getByRole('form', { name: 'Scénario de vente' });
  await form.getByLabel('Date de vente *').fill('2030-06-30');
  await form.getByLabel('Prix de vente net vendeur (€) *').fill('290000');
  await form.getByRole('button', { name: 'Ajouter le scénario' }).click();
  await expect(page.getByText('Scénario du 30/06/2030 ajouté.')).toBeVisible();
  const added = phone
    ? page.getByRole('region', { name: 'Scénario du 30/06/2030' })
    : page.getByRole('columnheader', { name: /Vente le 30\/06\/2030/ });
  await expect(added).toBeVisible();
  await expect(added).toContainText('290 000,00 €');
  await capture(page, testInfo, 'us11-scenario-ajoute');

  // Une date avant l'achat est refusée.
  await page.getByRole('button', { name: 'Ajouter un scénario' }).click();
  await form.getByLabel('Date de vente *').fill('2016-01-01');
  await form.getByRole('button', { name: 'Ajouter le scénario' }).click();
  await expect(form.getByRole('alert')).toContainText('doit suivre la date d’acquisition');
  await form.getByRole('button', { name: 'Annuler' }).click();

  // Modifier : le prix passe à 300 000 €, la somme nette suit.
  await page
    .getByRole('button', { name: 'Modifier le scénario du 30/06/2030' })
    .filter({ visible: true })
    .click();
  await expect(form.getByLabel('Prix de vente net vendeur (€) *')).toHaveValue('290000');
  await form.getByLabel('Prix de vente net vendeur (€) *').fill('300000');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Scénario du 30/06/2030 modifié.')).toBeVisible();
  await expect(added).toContainText('300 000,00 €');

  // Supprimer (confirmation acceptée).
  await page
    .getByRole('button', { name: 'Supprimer le scénario du 30/06/2030' })
    .filter({ visible: true })
    .click();
  await expect(page.getByText('Scénario du 30/06/2030 supprimé.')).toBeVisible();
  await expect(added).toHaveCount(0);

  // La suppression est enregistrée : un des scénarios du jeu de test aussi.
  await page
    .getByRole('button', { name: 'Supprimer le scénario du 30/06/2029' })
    .filter({ visible: true })
    .click();
  await page.reload();
  const remaining = phone
    ? page.getByRole('region', { name: /^Scénario du / })
    : page.getByRole('columnheader', { name: /^Vente le / });
  await expect(remaining).toHaveCount(2);
});

test('les hypothèses de vente se modifient à l’écran', async ({ page }, testInfo) => {
  const phone = isPhone(testInfo);
  await goToSale(page);
  await page.getByRole('button', { name: 'Hypothèses de vente' }).click();
  const form = page.getByRole('form', { name: 'Hypothèses de vente' });
  await expect(form.getByLabel('Frais divers de vente (€)')).toHaveValue('1674');
  await expect(form.getByLabel('Taux des prélèvements sociaux sur la plus-value (%)')).toHaveValue(
    '17,2',
  );
  // 1 000 € de frais de vente en plus : la somme nette du scénario 1 baisse d'autant.
  await form.getByLabel('Frais divers de vente (€)').fill('2674');
  await form.getByRole('button', { name: 'Enregistrer les hypothèses' }).click();
  await expect(page.getByText('Hypothèses enregistrées')).toBeVisible();
  await expect(cell(page, phone, 'Somme nette perçue', SCENARIOS[0]!)).toHaveText(
    eur(num('Somme nette perçue', 0) - 1000),
  );
  await capture(page, testInfo, 'us11-hypotheses');
});

test('placement de référence : saisi dans ⚙ Paramètres, comparé partout', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo);
  // Synthèse, sans placement : le TRI s'affiche, la comparaison invite à le renseigner.
  await goTo(page, 'Synthèse');
  const help = page.getByTestId('aide-rentabilite');
  await expect(help).toContainText(/ton argent t’a rapporté \d+,\d\d\s%\spar an/);
  await expect(help).toContainText('Renseigne un placement de référence');

  // Saisie du placement.
  await openSettings(page);
  const form = page.getByRole('form', { name: 'Placement de référence' });
  await expect(form.getByLabel('Taux annuel (%)')).toHaveValue('');
  await form.getByLabel('Libellé').fill('fonds euros');
  await form.getByLabel('Taux annuel (%)').fill('3');
  await form.getByRole('button', { name: 'Enregistrer le placement' }).click();
  await expect(page.getByText(`fonds euros à ${pct(0.03)} par an`)).toBeVisible();
  await capture(page, testInfo, 'us11-placement-parametres');

  // Synthèse : TRI si je vends aujourd'hui et gain par rapport au placement.
  await goTo(page, 'Synthèse');
  await expect(help).toContainText(
    `contre ${pct(0.03)} pour le placement de référence (fonds euros)`,
  );
  if (phone) {
    const card = page.getByRole('region', { name: 'Année 2026' });
    await expect(card.getByText('TRI si je vends aujourd’hui (au 01/11/2026)')).toBeVisible();
    await expect(
      card.getByText(`Gain par rapport au placement (fonds euros, ${pct(0.03)})`),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole('rowheader', { name: 'TRI si je vends aujourd’hui (au 01/11/2026)' }),
    ).toBeVisible();
    const row = page.locator('table[aria-label="Synthèse annuelle"] tr').filter({
      has: page.getByRole('rowheader', {
        name: `Gain par rapport au placement (fonds euros, ${pct(0.03)})`,
      }),
    });
    await expect(row.locator('td').last()).toHaveText(/^\d[\d\s\u202f]*,\d\d\s€$/);
  }
  await capture(page, testInfo, 'us11-synthese-rentabilite');

  // Simulations › Vente : le gain par rapport au placement de chaque scénario, positif
  // (TRI d'environ 4,5 à 5 %, au-dessus de 3 %).
  await goToSale(page);
  for (const scenario of SCENARIOS) {
    const value = cell(
      page,
      phone,
      `Gain par rapport au placement (fonds euros, ${pct(0.03)})`,
      scenario,
    );
    await expect(value).toHaveText(/^\d[\d\s\u202f]*,\d\d\s€$/);
    await expect(value).toHaveClass(/positive/);
  }
  await capture(page, testInfo, 'us11-vente-avec-placement');
});
