import { expect, test } from '@playwright/test';

/**
 * Modal dialogs make the page behind them `inert` (src/hooks/useInertOutside.ts).
 * TalkBack ignores `aria-modal` and swiped from the open AI panel into the page
 * it covers; `inert` is what removes that page for every screen reader. The two
 * things only a real browser can show: the page really is inert while the
 * dialog is open, and focus still makes it back to the opener on close —
 * browsers ignore focus() inside an inert subtree, which jsdom does not model.
 */
test('the AI panel takes the page out of reach while open and gives focus back on close', async ({ page }) => {
  await page.goto('/tools/dashboard');
  // Narrow screens start with the launcher tucked away behind "Show".
  const reveal = page.getByRole('button', { name: 'Show FinatriX AI' });
  const launcher = page.getByRole('button', { name: 'Open FinatriX AI' });
  await expect(reveal.or(launcher).first()).toBeVisible();
  if (await reveal.isVisible()) await reveal.click();
  await launcher.focus();
  await launcher.press('Enter');

  const panel = page.getByRole('dialog', { name: /FinatriX AI/ });
  await expect(panel).toBeVisible();
  await expect(page.locator('#root')).toHaveAttribute('inert', '');

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
  await expect(launcher).toBeFocused();
});
