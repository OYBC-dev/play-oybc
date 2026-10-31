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

test('the host binds a name someone joined under differently, then retires it', async ({ browser }) => {
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

  // The host opens the players, taps the dashed Jess chip and picks Jessie.
  await A.page.getByRole('button', { name: '3 players' }).click();
  const players = A.page.getByRole('list', { name: 'Players' });
  await players.getByRole('button', { name: 'Jess', exact: true }).click();
  const sheet = A.page.getByRole('dialog', { name: 'Jess' });
  await sheet.getByRole('radio', { name: 'Jessie' }).click();
  await expect(sheet.getByRole('radio', { name: 'Jessie' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toHaveCount(0);

  // Bound: Jessie still cannot see it; Seth reads it with Jessie's name.
  await expect(B.page.getByTestId('redacted')).toHaveCount(1);
  await expect(row(C.page, 'Jessie sings')).toBeVisible();

  // The host retires Jess (now a tag inside Jessie's chip): everyone reads plain "Jess sings".
  await players.getByRole('button', { name: 'Jess', exact: true }).click();
  await A.page.getByRole('dialog', { name: 'Jess' }).getByRole('button', { name: 'Not coming' }).click();
  await A.page.getByRole('dialog', { name: 'Not coming?' }).getByRole('button', { name: 'Remove' }).click();
  await expect(A.page.getByRole('dialog')).toHaveCount(0);
  for (const p of [A.page, B.page, C.page]) await expect(row(p, 'Jess sings')).toBeVisible();
  await expect(B.page.getByTestId('redacted')).toHaveCount(0);
  await expect(row(C.page, 'Jessie sings')).toHaveCount(0);
  await expect(players.getByRole('button', { name: 'Jess', exact: true })).toHaveCount(0);

  for (const c of [A.ctx, B.ctx, C.ctx]) await c.close();
});
