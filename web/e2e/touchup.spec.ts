import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const VIEWPORT = { width: 390, height: 844 };
const SEEN_KEY = 'oybc.howto.seen';

/** A phone with empty storage: it has never seen "How tasks work" (the config seeds the key for every other spec). */
async function freshPhone(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: VIEWPORT, storageState: { cookies: [], origins: [] } });
  return { ctx, page: await ctx.newPage() };
}

async function host(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Host a game' }).click();
  await page.getByRole('button', { name: 'Create game' }).click();
  await expect(page.getByTestId('stage-lobby')).toBeVisible();
  return (await page.getByLabel('Game code').textContent())!.trim();
}

const explainer = (page: Page) => page.getByRole('dialog', { name: 'Four kinds of task' });

test('How tasks work: opens on first join, dismissing sets the key, the (i) bubble reopens it', async ({ browser }) => {
  const A = await freshPhone(browser);
  const B = await freshPhone(browser);

  const code = await host(A.page, 'Stephen');
  await expect(explainer(A.page)).toBeVisible();
  await expect(explainer(A.page)).toContainText('Welcome, Stephen');
  await A.page.getByRole('button', { name: "Got it, let's add some" }).click();
  await expect(explainer(A.page)).toHaveCount(0);
  await expect(A.page.getByLabel('Task', { exact: true })).toBeFocused();
  expect(await A.page.evaluate((k) => localStorage.getItem(k), SEEN_KEY)).toBe('1');

  // Seen: a reload does not reopen it.
  await A.page.reload();
  await expect(A.page.getByTestId('stage-lobby')).toBeVisible();
  await expect(explainer(A.page)).toHaveCount(0);

  // The bubble beside Add reopens it as the Pool explainer.
  const bubble = A.page.getByRole('button', { name: 'How tasks work' });
  await bubble.click();
  await expect(explainer(A.page)).toContainText('Pool');
  await explainer(A.page).getByRole('button', { name: 'Done' }).click();
  await expect(explainer(A.page)).toHaveCount(0);
  await expect(bubble).toBeFocused();

  // A player on a new device gets it too; Escape dismisses it.
  await B.page.goto(`/g/${code}`);
  await B.page.getByLabel('Your name').fill('Cody');
  await B.page.getByRole('button', { name: 'Join' }).click();
  await expect(explainer(B.page)).toContainText('Welcome, Cody');
  await B.page.keyboard.press('Escape');
  await expect(explainer(B.page)).toHaveCount(0);
  expect(await B.page.evaluate((k) => localStorage.getItem(k), SEEN_KEY)).toBe('1');

  for (const c of [A.ctx, B.ctx]) await c.close();
});

test('the lobby sheet expands to readiness and players; Launch stays pinned; collapses on Done, Escape and the scrim', async ({ browser }) => {
  const A = await browser.newContext({ viewport: VIEWPORT });
  const B = await browser.newContext({ viewport: VIEWPORT });
  const a = await A.newPage();
  const b = await B.newPage();

  const code = await host(a, 'Stephen');
  await b.goto(`/g/${code}`);
  await b.getByLabel('Your name').fill('Cody');
  await b.getByRole('button', { name: 'Join' }).click();
  await expect(b.getByTestId('stage-lobby')).toBeVisible();
  for (let i = 1; i <= 3; i++) {
    await b.getByLabel('Task', { exact: true }).fill(`Cody thing ${i}`);
    await b.getByRole('button', { name: 'Add' }).click();
    await expect(b.getByLabel('Task', { exact: true })).toHaveValue('');
  }

  // Host: the QR tile opens the expanded sheet.
  await a.getByRole('button', { name: 'Show QR code' }).click();
  const sheet = a.getByRole('dialog', { name: `Game ${code}` });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('3 of 25 in the pool', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Need 22 more', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Cody needs 22 more')).toBeVisible();
  await expect(sheet.getByTestId('player-row')).toHaveCount(2);
  const launch = sheet.getByRole('button', { name: 'Launch · need 22 more' });
  await expect(launch).toBeDisabled();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'Show QR code' })).toBeFocused();

  // A drag up on the handle expands; Escape collapses; the scrim collapses.
  const handle = a.getByRole('button', { name: 'Expand' });
  const box = (await handle.boundingBox())!;
  await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await a.mouse.down();
  await a.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 6 });
  await a.mouse.up();
  await expect(sheet).toBeVisible();
  await a.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await handle.click();
  await expect(sheet).toBeVisible();
  await a.getByTestId('sheet-scrim').click({ position: { x: 20, y: 20 } });
  await expect(sheet).toHaveCount(0);

  // Player: their own line and the not-ready footer (no dots), and no mini waiting pill while filling.
  await expect(b.getByTestId('player-waiting-mini')).toHaveCount(0);
  await b.getByRole('button', { name: 'Expand' }).click();
  const pSheet = b.getByRole('dialog', { name: `Game ${code}` });
  await expect(pSheet.getByText("You've added 3 · 22 more to go")).toBeVisible();
  await expect(pSheet.getByTestId('player-waiting')).toHaveText('Pool needs 22 more tasks');
  await expect(pSheet.getByRole('button', { name: /^Launch/ })).toHaveCount(0);

  for (const c of [A, B]) await c.close();
});
