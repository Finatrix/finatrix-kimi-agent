import { expect, test } from '@playwright/test';
import { jsPDF } from 'jspdf';

function statementPdf(): Buffer {
  const pdf = new jsPDF();
  pdf.text([
    'Account statement for October 2026',
    'Date Description Debit Balance',
    '01/10/2026 Blue Bottle Cafe 125.00 9875.00',
    '02/10/2026 Market Groceries 230.00 9645.00',
    '03/10/2026 Bus Ticket 35.00 9610.00',
    '04/10/2026 Coffee Shop 45.00 9565.00',
    '05/10/2026 Local Pharmacy 110.00 9455.00',
  ], 12, 20);
  return Buffer.from(pdf.output('arraybuffer'));
}

test('a supported engine loads the lazy PDF reader and shows transactions for review', async ({ page }) => {
  await page.goto('/tools/expenses');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a statement' });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'fictional-statement.pdf',
    mimeType: 'application/pdf',
    buffer: statementPdf(),
  });
  await expect(dialog.getByText('We could not read that file')).toHaveCount(0);
  await expect(dialog.getByText(/Transactions found in fictional-statement\.pdf/)).toBeVisible();
  await expect(dialog.getByText('Blue Bottle Cafe')).toBeVisible();
});

test('an amount corrected in the review is the amount that is imported', async ({ page }) => {
  await page.goto('/tools/expenses');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a statement' });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'november.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Date,Description,Debit,Credit,Balance',
      '03/11/2026,SWIGGY BANGALORE,450.00,,9550.00',
      '05/11/2026,UBER TRIP,220.50,,9329.50',
    ].join('\n')),
  });
  const swiggy = dialog.getByRole('textbox', { name: 'Amount for Swiggy', exact: true });
  await expect(swiggy).toHaveValue('450');

  // Turned away: the field goes back to what the row has, and says why.
  await swiggy.fill('0');
  await swiggy.blur();
  await expect(swiggy).toHaveValue('450');
  await expect(dialog.getByRole('alert')).toContainText(/Enter an amount above zero\. Kept .*450\./);

  // Typed and left in the field: Import takes what the field shows, in every
  // engine — whether or not pressing the button takes focus from the field.
  await swiggy.fill('900/2+25.25');
  await dialog.getByRole('button', { name: 'Import 2 transactions' }).click();
  await expect(dialog).toHaveCount(0);

  const amounts = await page.evaluate(() => (
    JSON.parse(window.localStorage.getItem('fx_expenses') ?? '[]') as { amount: number }[]
  ).map((item) => item.amount).sort((a, b) => a - b));
  expect(amounts).toEqual([220.5, 475.25]);
});
