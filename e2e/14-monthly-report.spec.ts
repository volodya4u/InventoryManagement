import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { today } from './support/api';
import { signInAsAdmin } from './support/auth';
import { producedBouquet } from './support/bouquet';
import { pageRequest } from './support/page-api';
import { goTo } from './support/ui';

// March 2025 is a month no other spec sells in, so the report holds exactly the documents made here:
//   5 Mar  cash   2 x 100.00 (cost 138.00)        12 Mar card  1 x 90.00 (cost 69.00)
//   20 Feb bank transfer 1 x 80.00 (cost 69.00), a sale of another month
//   20 Mar the first sale gets 1 unit back (refund 100.00)     25 Mar the February sale gets its unit back (refund 80.00)
const MONTH = '2025-03';
// Each test that needs a month of its own gets one (the tests share one database), with the month before it for the other sale.
const previous = (month: string) => `${month.slice(0, 5)}${String(Number(month.slice(5)) - 1).padStart(2, '0')}`;

async function reportData(baseURL: string, tag: string, month = MONTH) {
  const { api, product } = await producedBouquet(baseURL, tag, 10);
  const first = await api.sale([{ productId: product.id, quantity: 2, unitPrice: 100 }], 'CASH', month + '-05');
  await api.sale([{ productId: product.id, quantity: 1, unitPrice: 90 }], 'CARD', month + '-12');
  const february = await api.sale([{ productId: product.id, quantity: 1, unitPrice: 80 }], 'BANK_TRANSFER', previous(month) + '-20');
  await api.returnItem(first, 1, month + '-20');
  await api.returnItem(february, 1, month + '-25');
  await api.dispose();
  return { first };
}

// Chromium has a month picker. Firefox and Safari show a plain text box for a month input (nothing to pick from, the
// person types YYYY-MM), and a text box reports its change when it loses focus, so the helper leaves it as a person does.
const setMonth = async (page: Page, month: string) => {
  const input = page.getByLabel('Report Month');
  await input.fill(month);
  await input.press('Tab');
};

const openReport = async (page: Page, month = MONTH) => {
  await page.getByRole('button', { name: 'Reports' }).hover();
  await page.getByRole('link', { name: 'Monthly Sales' }).click();
  await expect(page.getByRole('heading', { name: 'Monthly Sales', level: 1 })).toBeVisible();
  if (month) await setMonth(page, month);
};

const card = (page: Page, label: string) => page.locator('.summary-card').filter({ has: page.getByText(label, { exact: true }) });

test.describe('monthly sales report', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  // @trace FR-136, FR-137, FR-138, FR-139, FR-140, FR-141, FR-142, FR-143
  test('the report counts a month by the dates of its documents and splits it by payment method, day and product', async ({
    page,
    baseURL,
  }) => {
    await reportData(baseURL!, 'M1');
    await openReport(page);

    await expect(page.locator('.report-period')).toContainText('March');
    // The period runs from the first to the last day of the month, and a month in another shape is refused.
    const report = await pageRequest(page, 'GET', `/api/reports/monthly-sales?month=${MONTH}`);
    expect(report.json).toMatchObject({ periodStart: '2025-03-01', periodEnd: '2025-03-31' });
    const malformed = await pageRequest(page, 'GET', '/api/reports/monthly-sales?month=2025-3');
    expect(malformed.status).toBe(400);
    expect(malformed.text).toContain('Month must use the YYYY-MM format');
    await expect(card(page, 'Sales')).toContainText('2');
    await expect(card(page, 'Returns / Cancellations')).toContainText('2');
    await expect(card(page, 'Net Units')).toContainText('1');
    await expect(card(page, 'Net Units')).toContainText('2 returned');
    await expect(card(page, 'Gross Revenue')).toContainText('₴290.00');
    await expect(card(page, 'Refunds')).toContainText('₴180.00');
    await expect(card(page, 'Net Revenue')).toContainText('₴110.00');
    await expect(card(page, 'Net Cost')).toContainText('₴69.00');
    await expect(card(page, 'Net Gross Profit')).toContainText('₴41.00');
    await expect(card(page, 'Average Sale')).toContainText('₴145.00');

    // Cash, Card and Bank Transfer are always listed in that order; the February sale is not a March sale, its return is.
    const payments = page.locator('section', { has: page.getByRole('heading', { name: 'Payment Methods' }) });
    await expect(payments).toContainText(/Cash[\s\S]*Card[\s\S]*Bank Transfer/);
    await expect(payments).toContainText('1 sales / 1 reversals');
    await expect(payments).toContainText('0 sales / 1 reversals');

    const days = page.locator('section', { has: page.getByRole('heading', { name: 'Sales by Day' }) });
    await expect(days.locator('tbody tr')).toHaveCount(4);
    const products = page.locator('section', { has: page.getByRole('heading', { name: 'Products Sold' }) });
    await expect(products).toContainText('Bouquet M1');
  });

  // @trace FR-145
  test('Export CSV downloads the month as a UTF-8 file with a byte order mark', async ({ page, baseURL }) => {
    await reportData(baseURL!, 'M2', '2025-06');
    await openReport(page, '2025-06');
    await expect(card(page, 'Net Revenue')).toContainText('₴110.00');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('monthly-sales-2025-06.csv');

    const bytes = readFileSync((await file.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.toString('utf8').slice(1);
    expect(text).toContain('\r\n');
    const lines = text.split('\r\n').filter((line) => line !== '');
    expect(lines[0]).toBe('"Monthly Sales Report","2025-06"');
    for (const line of lines) expect(line).toMatch(/^".*"$/);
    expect(text).toMatch(/"SALE-20250605-\d{4}","2025-06-05","(?:COMPLETED|PARTIALLY_RETURNED)"/);
    expect(lines.at(-1)).toMatch(/^"Monthly Net Totals"/);
  });

  // @trace FR-146
  test('a sale number in the report opens that sale', async ({ page, baseURL }) => {
    const { first } = await reportData(baseURL!, 'M3', '2025-09');
    await openReport(page, '2025-09');

    await page.getByRole('link', { name: first.saleNumber }).first().click();
    await expect(page).toHaveURL(new RegExp(`/sales\\?saleId=${first.id}$`));
    await expect(page.getByRole('dialog', { name: first.saleNumber })).toBeVisible();
  });

  // @trace FR-144
  test('the report opens on the current month, ignores a cleared month, and shows an error instead of old numbers', async ({ page }) => {
    await openReport(page, '');
    await expect(page.getByLabel('Report Month')).toHaveValue(today().slice(0, 7));

    await setMonth(page, MONTH);
    await expect(page.locator('.report-period')).toContainText('March');
    await setMonth(page, '');
    await expect(page.locator('.report-period')).toContainText('March');

    await page.route('**/api/reports/monthly-sales*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ title: 'Report failed', detail: 'The report could not be built.' }),
      }),
    );
    await setMonth(page, '2025-04');
    await expect(page.getByRole('alert')).toContainText('The report could not be built.');
    await expect(page.locator('.summary-grid')).toHaveCount(0);
  });
});
