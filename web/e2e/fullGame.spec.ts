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

/**
 * Plain tasks in the pool. With `@Stephen falls asleep` (by B) and `@Cody says boo` (by A) the pool is 26:
 * 25 dealable to Stephen and to Cody, so each of their boards holds every task dealable to them.
 */
const PLAIN = 24;
const POOL = PLAIN + 2;

/** One board's basics: 25 cells, no Free centre (free space is off), no label with '@'. */
async function checkBoard(page: Page): Promise<void> {
  const cells = page.locator('button[data-marked]');
  await expect(cells).toHaveCount(25);
  await expect(page.locator('button[data-free="true"]')).toHaveCount(0);
  const labels = await cells.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  expect(labels.filter((l) => l.includes('@'))).toEqual([]);
}

/** The mention square `label` is on the board, marked as a reference, with `name` in bold. */
async function expectMentionSquare(page: Page, label: string, name: string): Promise<void> {
  const cell = page.getByRole('button', { name: label, exact: true });
  await expect(cell).toHaveCount(1);
  await expect(cell).toHaveAttribute('data-ref', 'true');
  await expect(cell.locator('b')).toHaveText(name);
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

  // Only the host gets the Free space switch, off by default.
  await expect(A.page.getByRole('switch', { name: 'Free space' })).not.toBeChecked();
  await expect(B.page.getByRole('switch')).toHaveCount(0);

  // 2. B mentions Stephen: A sees it blurred, C sees the display text with the name in bold and no '@'.
  await B.page.getByLabel('Task', { exact: true }).fill('@Stephen falls asleep');
  await B.page.getByRole('button', { name: 'Add' }).click();
  const cRow = C.page.locator('li', { hasText: 'Stephen falls asleep' });
  await expect(cRow).toBeVisible();
  await expect(cRow.locator('b')).toHaveText('Stephen');
  await expect(C.page.getByText('@Stephen')).toHaveCount(0);
  await expect(A.page.getByTestId('redacted')).toHaveCount(1);
  await expect(A.page.locator('li', { hasText: 'falls asleep' })).toHaveCount(0);

  // 3. A mentions Cody, then seeds the plain tasks; every seat has at least 25 dealable, and A launches.
  await A.page.getByLabel('Task', { exact: true }).fill('@Cody says boo');
  await A.page.getByRole('button', { name: 'Add' }).click();
  await expect(A.page.getByLabel('Task', { exact: true })).toHaveValue('');
  await expect(B.page.getByTestId('redacted')).toHaveCount(1);
  for (let i = 1; i <= PLAIN; i++) {
    await A.page.getByLabel('Task', { exact: true }).fill(`Task ${i}`);
    await A.page.getByRole('button', { name: 'Add' }).click();
    await expect(A.page.getByLabel('Task', { exact: true })).toHaveValue('');
  }
  await expect(C.page.getByText(`${POOL} in pool`)).toBeVisible();
  await expect(C.page.getByTestId('pool-count')).toHaveText(`${POOL} / 25`);
  await expect(A.page.getByTestId('pool-count')).toHaveText('25 / 25');
  await expect(B.page.getByTestId('pool-count')).toHaveText('25 / 25');
  const launch = A.page.getByRole('button', { name: 'Launch' });
  await expect(launch).toBeEnabled();
  await launch.click();
  for (const p of [A, B, C]) await expect(p.page.getByTestId('stage-playing')).toBeVisible();

  // Board cells show mentions resolved, with no '@'. Stephen's and Cody's boards hold every task dealable
  // to them, so each carries the square that mentions the other.
  for (const p of [A, B, C]) await checkBoard(p.page);
  await expectMentionSquare(B.page, 'Stephen falls asleep', 'Stephen');
  await expectMentionSquare(A.page, 'Cody says boo', 'Cody');

  // 4. A marks the first row; B and C see the banner, A does not.
  const aCells = A.page.locator('button[data-marked]');
  await expect(aCells).toHaveCount(25);
  for (let i = 0; i < 5; i++) {
    await aCells.nth(i).click();
    await expect(aCells.nth(i)).toHaveAttribute('data-marked', 'true');
  }
  await expect(B.page.getByRole('button', { name: 'Stephen got a bingo!' })).toBeVisible();
  await expect(C.page.getByRole('button', { name: 'Stephen got a bingo!' })).toBeVisible();
  await expect(A.page.getByRole('button', { name: 'Stephen got a bingo!' })).toHaveCount(0);

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
  await checkBoard(D.page);

  // 7. E joins as "cody": waits; A allows; E gets Cody's board and marks.
  const E = await phone(browser);
  extra.push(E.ctx);
  await join(E.page, code, 'cody');
  await expect(E.page.getByText('Waiting for the host')).toBeVisible();
  await expect(A.page.getByText("Someone wants to take Cody's seat")).toBeVisible();
  await A.page.getByRole('button', { name: 'Allow' }).click();
  await expect(E.page.getByTestId('stage-playing')).toBeVisible();
  const eCells = E.page.locator('button[data-marked]');
  await expect(eCells).toHaveCount(25);
  expect(await eCells.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(bLabels);
  expect(await marks(E.page)).toEqual(bMarks);

  // 8. A ends the game: everyone still seated sees the standings with Stephen first (one bingo, five squares).
  // B was displaced by E's approved reclaim (the server deletes the old member doc), so B has no read access any more.
  await A.page.getByRole('button', { name: 'Menu' }).click();
  await A.page.getByRole('menuitem', { name: 'End game' }).click();
  await A.page.getByRole('dialog', { name: 'End the game?' }).getByRole('button', { name: 'End game' }).click();
  for (const p of [A, C, D, E]) {
    await expect(p.page.getByTestId('stage-ended')).toBeVisible();
    const rows = p.page.getByTestId('standing');
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText('Stephen');
    await expect(rows.first()).toContainText('1 bingo');
    await expect(rows.first()).toContainText('5 squares');
  }

  for (const c of [A.ctx, B.ctx, C.ctx, ...extra]) await c.close();
});
