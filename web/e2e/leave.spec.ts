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

test('a guest who leaves the lobby gives the seat up: mentions of them go back on the roster; rejoining seats them afresh', async ({ browser }) => {
  const A = await phone(browser);
  const B = await phone(browser);

  await A.page.goto('/');
  await A.page.getByLabel('Your name').fill('Stephen');
  await A.page.getByRole('button', { name: 'Host a game' }).click();
  await A.page.getByRole('button', { name: 'Create game' }).click();
  await expect(A.page.getByTestId('stage-lobby')).toBeVisible();
  const code = (await A.page.getByLabel('Game code').textContent())!.trim();
  await join(B.page, code, 'Jessie');

  // Jessie is named by a task, so it is kept from her.
  await A.page.getByLabel('Task', { exact: true }).fill('@Jessie sings');
  await A.page.getByRole('button', { name: 'Add' }).click();
  await expect(row(A.page, 'Jessie sings')).toBeVisible();
  await expect(B.page.getByTestId('redacted')).toHaveCount(1);
  await expect(A.page.getByRole('button', { name: '2 players', exact: true })).toBeVisible();

  // Jessie leaves: Home for her; the host's count drops and Jessie is back on the roster as nobody yet.
  await B.page.getByRole('button', { name: 'Menu' }).click();
  await B.page.getByRole('menuitem', { name: 'Leave game' }).click();
  await expect(B.page.getByRole('button', { name: 'Host a game' })).toBeVisible();
  await expect(A.page.getByRole('button', { name: '1 player', exact: true })).toBeVisible();
  await A.page.getByRole('button', { name: 'Menu' }).click();
  await expect(A.page.getByTestId('roster-unbound-count')).toHaveText('1');
  await A.page.getByRole('menuitem', { name: /^Roster/ }).click();
  const players = A.page.getByRole('list', { name: 'Players' });
  await expect(players.getByRole('button', { name: 'Jessie, nobody yet' })).toBeVisible();
  await A.page.keyboard.press('Escape');

  // She comes back by code as a newcomer: the name binds to her new seat, so the task is kept from her again.
  await join(B.page, code, 'Jessie');
  await expect(B.page.getByTestId('redacted')).toHaveCount(1);
  await expect(A.page.getByRole('button', { name: '2 players', exact: true })).toBeVisible();

  for (const c of [A.ctx, B.ctx]) await c.close();
});
