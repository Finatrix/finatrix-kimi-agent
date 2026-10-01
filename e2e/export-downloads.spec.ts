import { test, expect, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'export-spend', amount: 125.5, category: 'groceries', date: `${month}-01`, merchant: 'Export market', note: 'Test groceries' },
      { id: 'export-refund', amount: -25.5, category: 'groceries', date: `${month}-02`, merchant: 'Export refund', note: 'Test refund' },
    ]));
  });
});

async function bytesOf(download: Download) {
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

for (const [format, label] of [
  ['csv', 'Download CSV'], ['xlsx', 'Download Excel (.xlsx)'], ['pdf', 'Download PDF'],
] as const) {
  test(`expense ${format} export delivers a nonempty file`, async ({ page }) => {
    await page.goto('/tools/expenses');
    await page.getByRole('button', { name: 'Export ▾', exact: true }).first().click();
    const pending = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: label, exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp(`^finatrix-expenses-.*\\.${format}$`));
    const bytes = await bytesOf(download);
    expect(bytes.length).toBeGreaterThan(100);
    if (format === 'csv') {
      const csv = bytes.toString('utf8');
      expect(csv).toContain('Export market');
      expect(csv).toContain('Export refund');
      expect(csv).toContain('-25.5');
    } else if (format === 'xlsx') {
      expect(bytes.subarray(0, 2).toString()).toBe('PK');
    } else {
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    }
    await expect(page.getByRole('button', { name: 'Export ▾', exact: true }).first()).toBeEnabled();
  });
}

test('backup download preserves stored records and marks the completed export', async ({ page }) => {
  await page.goto('/tools/settings');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup (JSON)' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^finatrix-backup-.*\.json$/);
  const backup = JSON.parse((await bytesOf(download)).toString('utf8'));
  expect(backup).toMatchObject({ app: 'FinatriX', kind: 'backup', version: 1 });
  expect(backup.data.fx_expenses).toHaveLength(2);
  expect(backup.data.fx_expenses.map((entry: { amount: number }) => entry.amount)).toEqual([125.5, -25.5]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('fx_last_backup_export'))).not.toBeNull();
});
