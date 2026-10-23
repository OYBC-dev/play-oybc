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
}

/** Marked state of every board cell, in order. */
async function marks(page: Page): Promise<string[]> {
  return page.locator('button[data-marked]').evaluateAll((els) => els.map((e) => e.getAttribute('data-marked') ?? ''));
}

test('three phones play a full game', async ({ browser }) => {
  const A = await phone(browser);
  const B = await phone(browser);
  const C = await phone(browser);
  const extra: BrowserContext[] = [];

  // 1. A hosts; B and C join through the link.
  await A.page.goto('/');
  await A.page.getByLabel('Your name').fill('Stephen');
  await A.page.getByRole('button', { name: 'Host a game' }).click();
  await expect(A.page.getByTestId('stage-lobby')).toBeVisible();
  const code = (await A.page.getByLabel('Game code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  await join(B.page, code, 'Cody');
  await join(C.page, code, 'Seth');
  await expect(B.page.getByTestId('stage-lobby')).toBeVisible();
  await expect(C.page.getByTestId('stage-lobby')).toBeVisible();

  // 2. B mentions Stephen: A sees it blurred, C sees the text.
  await B.page.getByLabel('Task', { exact: true }).fill('@Stephen falls asleep');
  await B.page.getByRole('button', { name: 'Add' }).click();
  await expect(C.page.getByText('@Stephen falls asleep')).toBeVisible();
  await expect(A.page.getByTestId('redacted')).toHaveCount(1);
  await expect(A.page.getByText('@Stephen falls asleep')).toHaveCount(0);

  // 3. Seed the pool to 30 through the UI, then A launches.
  for (let i = 2; i <= 30; i++) {
    await A.page.getByLabel('Task', { exact: true }).fill(`Task ${i}`);
    await A.page.getByRole('button', { name: 'Add' }).click();
    await expect(A.page.getByLabel('Task', { exact: true })).toHaveValue('');
  }
  const launch = A.page.getByRole('button', { name: 'Launch' });
  await expect(launch).toBeEnabled();
  await launch.click();
  for (const p of [A, B, C]) await expect(p.page.getByTestId('stage-playing')).toBeVisible();

  // 4. A marks the first row; B and C see the banner, A does not.
  const aCells = A.page.locator('button[data-marked]');
  await expect(aCells).toHaveCount(25);
  for (let i = 0; i < 5; i++) {
    await aCells.nth(i).click();
    await expect(aCells.nth(i)).toHaveAttribute('data-marked', 'true');
  }
  await expect(B.page.getByText('Stephen got a bingo!')).toBeVisible();
  await expect(C.page.getByText('Stephen got a bingo!')).toBeVisible();
  await expect(A.page.getByText('Stephen got a bingo!')).toHaveCount(0);

  // 5. B marks a cell, reloads: same board, same marks, no name prompt.
  const bCells = B.page.locator('button[data-marked]');
  await bCells.nth(6).click();
  await expect(bCells.nth(6)).toHaveAttribute('data-marked', 'true');
  const bLabels = await bCells.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const bMarks = await marks(B.page);
  await B.page.reload();
  await expect(B.page.getByTestId('stage-playing')).toBeVisible();
  await expect(B.page.getByLabel('Your name')).toHaveCount(0);
  await expect(bCells).toHaveCount(25);
  expect(await bCells.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(bLabels);
  expect(await marks(B.page)).toEqual(bMarks);

  // 6. D joins mid-game and gets a board.
  const D = await phone(browser);
  extra.push(D.ctx);
  await join(D.page, code, 'Josh');
  await expect(D.page.getByTestId('stage-playing')).toBeVisible();
  await expect(D.page.locator('button[data-marked]')).toHaveCount(25);

  // 7. E joins as "cody": waits; A allows; E gets Cody's board and marks.
  const E = await phone(browser);
  extra.push(E.ctx);
  await join(E.page, code, 'cody');
  await expect(E.page.getByText('Waiting for the host')).toBeVisible();
  await expect(A.page.getByText('Cody wants back in')).toBeVisible();
  await A.page.getByRole('button', { name: 'Allow' }).click();
  await expect(E.page.getByTestId('stage-playing')).toBeVisible();
  const eCells = E.page.locator('button[data-marked]');
  await expect(eCells).toHaveCount(25);
  expect(await eCells.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(bLabels);
  expect(await marks(E.page)).toEqual(bMarks);

  // 8. A ends the game: everyone sees the leaderboard with Stephen first.
  await A.page.getByRole('button', { name: 'End game' }).click();
  await A.page.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  for (const p of [A, B, C, D, E]) {
    await expect(p.page.getByTestId('stage-ended')).toBeVisible();
    await expect(p.page.locator('ol li').first()).toContainText('Stephen');
  }

  for (const c of [A.ctx, B.ctx, C.ctx, ...extra]) await c.close();
});
