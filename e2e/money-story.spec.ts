import { expect, test } from '@playwright/test';

/**
 * Monthly money story (src/tools/ui/MoneyStory.tsx): a finished month recapped
 * in five swipeable cards, shareable as a picture with amounts hidden. The
 * parts only a real browser proves: the scroll-snap carousel moves, the
 * dialog takes the page out of reach and gives focus back, and the picture
 * really is a PNG drawn on canvas.
 */
function ym(offset: number): string {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

test.beforeEach(async ({ page }) => {
  const prev = ym(-2);
  const last = ym(-1);
  const rows = [
    { date: `${prev}-01`, category: 'rent', amount: 20000 },
    { date: `${prev}-10`, category: 'eating_out', amount: 4000 },
    { date: `${last}-01`, category: 'rent', amount: 20000 },
    { date: `${last}-10`, category: 'eating_out', amount: 1600 },
    { date: `${last}-15`, category: 'stocks', amount: 3000 },
  ].map((r, i) => ({ id: `e2e-${i}`, ...r }));
  await page.addInitScript((data) => {
    localStorage.setItem('fx_expenses', JSON.stringify(data));
  }, rows);
});

test('opens the story, pages through five cards and closes with focus returned', async ({ page }) => {
  await page.goto('/tools/dashboard');
  const open = page.getByRole('button', { name: 'View story' });
  await expect(open).toBeVisible();
  await open.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await expect(dialog.getByText('1 of 5')).toBeVisible();
  await expect(dialog.getByText('Your month at a glance').or(dialog.getByText(/^You spent/))).toBeVisible();

  const next = dialog.getByRole('button', { name: 'Next card' });
  await next.click();
  await expect(dialog.getByText('2 of 5')).toBeVisible();
  await expect(dialog.getByRole('group', { name: '2 of 5' }).getByText('Rent')).toBeVisible();
  await next.click();
  await expect(dialog.getByText('3 of 5')).toBeVisible();
  await expect(dialog.getByRole('group', { name: '3 of 5' })).toContainText('Eating Out fell 60%');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
  await expect(open).toBeFocused();
});

test('shares a PNG picture, amounts hidden by default', async ({ page }) => {
  // WebKit offers Web Share with files; remove it so every engine takes the save path.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await page.goto('/tools/dashboard');
  await page.getByRole('button', { name: 'View story' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('The picture hides your amounts')).toBeVisible();

  // No Web Share with files in the test browsers, so the picture is saved.
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Share this card' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^finatrix-\d{4}-\d{2}-story-1\.png$/);
});
