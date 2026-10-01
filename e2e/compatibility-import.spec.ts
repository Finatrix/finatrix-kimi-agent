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
