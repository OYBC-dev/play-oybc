import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const VIEWPORT = { width: 390, height: 844 };

async function phone(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  return { ctx, page: await ctx.newPage() };
}

async function join(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/g/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByTestId('stage-lobby')).toBeVisible();
}

/** The pool row whose visible text contains `text`. */
const row = (page: Page, text: string) => page.getByTestId('stage-lobby').locator('li', { hasText: text });

/** The host's player chip list (opened from the avatar stack). */
const playerList = (page: Page) => page.getByRole('list', { name: 'Players' });

test('the host binds a name someone joined under differently, unbinds it, then retires it', async ({ browser }) => {
  const A = await phone(browser);
  const B = await phone(browser);
  const C = await phone(browser);

  // A hosts and C joins. A mentions Jess, who is not here yet.
  await A.page.goto('/');
  await A.page.getByLabel('Your name').fill('Stephen');
  await A.page.getByRole('button', { name: 'Host a game' }).click();
  await expect(A.page.getByTestId('stage-lobby')).toBeVisible();
  const code = (await A.page.getByLabel('Game code').textContent())!.trim();
  await join(C.page, code, 'Seth');
  await A.page.getByLabel('Task', { exact: true }).fill('@Jess sings');
  await A.page.getByRole('button', { name: 'Add' }).click();
  await expect(A.page.getByLabel('Task', { exact: true })).toHaveValue('');
  await expect(row(A.page, 'Jess sings')).toBeVisible();
  // Unbound, it is kept from every seat no task names (Seth included).
  await expect(C.page.getByTestId('redacted')).toHaveCount(1);

  // B joins as Jessie: the task nearly names them, so it stays hidden from them.
  await join(B.page, code, 'Jessie');
  await expect(B.page.getByTestId('redacted')).toHaveCount(1);
  await expect(row(B.page, 'sings')).toHaveCount(0);

  // The host reaches the roster from the menu (one unbound name), taps the dashed Jess chip and picks Jessie.
  await A.page.getByRole('button', { name: 'Menu' }).click();
  await expect(A.page.getByTestId('roster-unbound-count')).toHaveText('1');
  await A.page.getByRole('menuitem', { name: /^Roster/ }).click();
  const players = playerList(A.page);
  await players.getByRole('button', { name: 'Jess, nobody yet' }).click();
  const sheet = A.page.getByRole('dialog', { name: 'Jess' });
  const radios = sheet.getByRole('radio');
  await expect(radios.first()).toHaveText('Nobody yet');
  await expect(sheet.getByRole('button', { name: 'Not coming' })).toBeVisible();
  await sheet.getByRole('radio', { name: 'Jessie' }).click();
  await expect(sheet.getByRole('radio', { name: 'Jessie' })).toHaveAttribute('aria-checked', 'true');
  // Bound: the person is in the room, so there is no Not coming.
  await expect(sheet.getByRole('button', { name: 'Not coming' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toHaveCount(0);

  // Bound: Jess is a tag inside Jessie's pill; Jessie still cannot see the task; Seth reads it.
  await expect(players.getByRole('button', { name: 'Jess, bound to Jessie' })).toBeVisible();
  await expect(B.page.getByTestId('redacted')).toHaveCount(1);
  await expect(row(C.page, 'sings')).toBeVisible();

  // Nobody yet unbinds: the dashed chip is back, with Not coming.
  await players.getByRole('button', { name: 'Jess, bound to Jessie' }).click();
  await sheet.getByRole('radio', { name: 'Nobody yet' }).click();
  await expect(sheet.getByRole('radio', { name: 'Nobody yet' })).toHaveAttribute('aria-checked', 'true');
  await expect(players.getByRole('button', { name: 'Jess, nobody yet' })).toBeVisible();

  // Retire: the hold drops, so Seth (and the host) read "Jess sings" with the mention still bold; the chip
  // goes. Jessie nearly names Jess, and the server keeps a task from a near name whatever the name's state.
  await sheet.getByRole('button', { name: 'Not coming' }).click();
  await A.page.getByRole('dialog', { name: 'Jess isn’t coming?' }).getByRole('button', { name: 'Not coming' }).click();
  await expect(A.page.getByRole('dialog')).toHaveCount(0);
  for (const p of [A.page, C.page]) {
    await expect(row(p, 'Jess sings')).toBeVisible();
    await expect(row(p, 'Jess sings').locator('b', { hasText: /^Jess$/ })).toBeVisible();
  }
  await expect(B.page.getByTestId('redacted')).toHaveCount(1);
  await expect(players.getByRole('button', { name: /^Jess,/ })).toHaveCount(0);
  await expect(players.getByText('Jess', { exact: true })).toHaveCount(0);

  for (const c of [A.ctx, B.ctx, C.ctx]) await c.close();
});

test('Launch with an unbound name asks first; confirming launches', async ({ browser }) => {
  const A = await phone(browser);
  const B = await phone(browser);

  await A.page.goto('/');
  await A.page.getByLabel('Your name').fill('Stephen');
  await A.page.getByRole('button', { name: 'Host a game' }).click();
  await expect(A.page.getByTestId('stage-lobby')).toBeVisible();
  const code = (await A.page.getByLabel('Game code').textContent())!.trim();
  await join(B.page, code, 'Sam');

  // Fill the pool until the sheet is ready; one task names Krispy, who never comes.
  const task = A.page.getByLabel('Task', { exact: true });
  const texts = ['@Krispy sings', ...Array.from({ length: 40 }, (_, i) => `Thing ${i + 1} happens`)];
  for (const t of texts) {
    if (await A.page.getByTestId('lobby-sheet').getAttribute('data-ready')) break;
    await task.fill(t);
    await A.page.getByRole('button', { name: 'Add' }).click();
    await expect(task).toHaveValue('');
  }
  await expect(A.page.getByTestId('lobby-sheet')).toHaveAttribute('data-ready', 'true');

  await A.page.getByRole('button', { name: 'Launch' }).click();
  const confirm = A.page.getByRole('dialog', { name: 'Launch?' });
  await expect(confirm.getByText('Krispy', { exact: true })).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(A.page.getByTestId('stage-lobby')).toBeVisible();

  await A.page.getByRole('button', { name: 'Launch' }).click();
  await confirm.getByRole('button', { name: 'Launch' }).click();
  for (const p of [A.page, B.page]) await expect(p.getByTestId('stage-playing')).toBeVisible();

  for (const c of [A.ctx, B.ctx]) await c.close();
});
