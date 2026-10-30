import { expect, test, type Page } from '@playwright/test';
import { today } from './support/api';
import { signInAsAdmin } from './support/auth';
import { producedBouquet } from './support/bouquet';
import { pageRequest } from './support/page-api';
import { goTo, nameRow } from './support/ui';

async function openSale(page: Page, text: string) {
  await goTo(page, 'Sales', 'Sales');
  await page.locator('tbody tr').filter({ hasText: text }).getByRole('button', { name: 'View' }).click();
  return page.locator('.sale-detail-dialog');
}

const stockOf = async (page: Page, name: string) => {
  await goTo(page, 'Products', 'Finished Products');
  return nameRow(page, name).getByRole('cell').nth(3);
};

const returnRequest = (saleItemId: number, quantity: number, returnDate = today()) => ({
  returnDate,
  reason: 'Customer Return',
  items: [{ saleItemId, quantity }],
});

test.describe('returns and cancellations', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  // @trace FR-111, FR-114, FR-115, FR-116, FR-118, FR-119, FR-120, FR-123, FR-126
  test('a return refunds at the price charged, puts the units back, and ends with the sale returned in full', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'R1');
    const sale = await api.sale([{ productId: product.id, quantity: 2, unitPrice: 100 }]);
    await api.dispose();
    const itemId = sale.items[0].id;

    const detail = await openSale(page, 'Bouquet R1');
    await expect(detail.locator('.sale-status')).toHaveText('Completed');
    await detail.getByRole('button', { name: 'Return Products' }).click();
    const dialog = page.getByRole('dialog', { name: 'Return Products' });

    await dialog.getByLabel('Return quantity for Bouquet R1').fill('3');
    await expect(dialog.getByText('Exceeds available quantity.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Complete Return' })).toBeDisabled();
    // The server refuses more than was sold the same way, and records nothing.
    const tooMany = await pageRequest(page, 'POST', `/api/sales/${sale.id}/returns`, returnRequest(itemId, 3));
    expect(tooMany.status).toBe(400);
    expect(tooMany.text).toContain('exceeds the remaining returnable quantity');

    await dialog.getByLabel('Return quantity for Bouquet R1').fill('1');
    await dialog.getByLabel('Reason *').selectOption({ label: 'Customer Return' });
    await expect(dialog.locator('.sale-totals')).toContainText('₴100.00');
    await expect(dialog.locator('.sale-totals')).toContainText('₴69.00');
    await dialog.getByRole('button', { name: 'Complete Return' }).click();
    await expect(dialog).toBeHidden();

    await expect(detail.locator('.sale-status')).toHaveText('Partially Returned');
    await expect(detail.locator('.return-history__item')).toContainText(/RET-\d{8}-\d{4}/);
    await expect(detail.locator('.return-history__item')).toContainText('Product Return');
    await expect(detail.locator('.return-history__item')).toContainText('−₴100.00');
    // 200.00 sold, 100.00 refunded; 138.00 of cost, 69.00 of it returned with the unit; 31.00 profit left.
    const totals = detail.locator('.sale-totals--detail');
    await expect(totals).toContainText('Gross Revenue₴200.00');
    await expect(totals).toContainText('Refunded₴100.00');
    await expect(totals).toContainText('Net Revenue₴100.00');
    await expect(totals).toContainText('Net Cost₴69.00');
    await expect(totals).toContainText('Net Gross Profit₴31.00');

    // The second unit: afterwards nothing is left to return or to cancel.
    await detail.getByRole('button', { name: 'Return Products' }).click();
    await dialog.getByLabel('Return quantity for Bouquet R1').fill('1');
    await dialog.getByRole('button', { name: 'Complete Return' }).click();
    await expect(dialog).toBeHidden();
    await expect(detail.locator('.sale-status')).toHaveText('Returned');
    // The last unit takes back all that is left of the cost.
    await expect(detail.locator('.sale-totals--detail')).toContainText('Net Cost₴0.00');
    await expect(detail.getByRole('button', { name: 'Return Products' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Cancel Sale' })).toHaveCount(0);
    const again = await pageRequest(page, 'POST', `/api/sales/${sale.id}/returns`, returnRequest(itemId, 1));
    expect(again.status).toBe(400);
    expect(again.text).toContain('All Products from this sale have already been returned');

    await detail.locator('footer').getByRole('button', { name: 'Close' }).click();
    await expect(await stockOf(page, 'Bouquet R1')).toHaveText('5');
  });

  // @trace FR-121
  test('a returned unit goes back at the cost it was sold with, and the product average is re-blended', async ({ page, baseURL }) => {
    const { api, product, peony } = await producedBouquet(baseURL!, 'R4', 4);
    const sale = await api.sale([{ productId: product.id, quantity: 2, unitPrice: 100 }]);
    // The peonies get dearer, so the next batch costs more than the units already made: 2 x 69.00 in stock, then
    // 2 x 121.0833 added, an average of 95.0417 over four units.
    await api.receipt(peony.id, 50, 150);
    await api.produce(product.id, 2);
    await api.dispose();
    await goTo(page, 'Products', 'Finished Products');
    await expect(nameRow(page, 'Bouquet R4').getByRole('cell').nth(3)).toHaveText('4');
    await expect(nameRow(page, 'Bouquet R4').getByRole('cell').nth(4)).toHaveText('₴95.04');

    const detail = await openSale(page, sale.saleNumber);
    await detail.getByRole('button', { name: 'Return Products' }).click();
    const dialog = page.getByRole('dialog', { name: 'Return Products' });
    await dialog.getByLabel('Return quantity for Bouquet R4').fill('1');
    await dialog.getByRole('button', { name: 'Complete Return' }).click();
    await expect(dialog).toBeHidden();
    await detail.locator('footer').getByRole('button', { name: 'Close' }).click();

    // (4 x 95.0417 + 1 x 69.00) / 5 = 89.8334
    await goTo(page, 'Products', 'Finished Products');
    await expect(nameRow(page, 'Bouquet R4').getByRole('cell').nth(3)).toHaveText('5');
    await expect(nameRow(page, 'Bouquet R4').getByRole('cell').nth(4)).toHaveText('₴89.83');
  });

  // @trace FR-116, FR-124, FR-125, FR-126
  test('cancelling a sale refunds all of it and restores the stock; a cancelled sale takes no return', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'R2');
    const sale = await api.sale([{ productId: product.id, quantity: 2, unitPrice: 100 }]);
    await api.dispose();

    const detail = await openSale(page, 'Bouquet R2');
    await detail.getByRole('button', { name: 'Cancel Sale' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel Sale' });
    await expect(dialog.locator('.cancellation-summary')).toContainText('₴200.00');
    await dialog.getByLabel('Reason *').selectOption({ label: 'Customer Cancelled' });
    await dialog.getByRole('button', { name: 'Confirm Cancellation' }).click();
    await expect(dialog).toBeHidden();

    await expect(detail.locator('.sale-status')).toHaveText('Cancelled');
    await expect(detail.locator('.return-history__item')).toContainText('Cancellation');
    await expect(detail.getByRole('button', { name: 'Return Products' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Cancel Sale' })).toHaveCount(0);
    const refused = await pageRequest(page, 'POST', `/api/sales/${sale.id}/returns`, returnRequest(sale.items[0].id, 1));
    expect(refused.status).toBe(400);
    expect(refused.text).toContain('A cancelled sale cannot receive Product returns');
    const twice = await pageRequest(page, 'POST', `/api/sales/${sale.id}/cancellation`, {
      cancellationDate: today(),
      reason: 'Customer Cancelled',
    });
    expect(twice.status).toBe(400);
    await detail.locator('footer').getByRole('button', { name: 'Close' }).click();
    await expect(await stockOf(page, 'Bouquet R2')).toHaveText('5');
  });

  // @trace FR-117, FR-125
  test('once part of a sale has been returned, the sale can no longer be cancelled; dates before the sale are refused', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'R3');
    const sale = await api.sale([{ productId: product.id, quantity: 2, unitPrice: 100 }]);
    await api.dispose();

    const detail = await openSale(page, 'Bouquet R3');
    await expect(detail.getByRole('button', { name: 'Cancel Sale' })).toBeVisible();
    const early = await pageRequest(page, 'POST', `/api/sales/${sale.id}/returns`, returnRequest(sale.items[0].id, 1, '2000-01-01'));
    expect(early.status).toBe(400);
    expect(early.text).toContain('cannot be earlier than the sale date');
    const earlyCancel = await pageRequest(page, 'POST', `/api/sales/${sale.id}/cancellation`, {
      cancellationDate: '2000-01-01',
      reason: 'Customer Cancelled',
    });
    expect(earlyCancel.status).toBe(400);
    expect(earlyCancel.text).toContain('cannot be earlier than the sale date');

    await detail.getByRole('button', { name: 'Return Products' }).click();
    const dialog = page.getByRole('dialog', { name: 'Return Products' });
    await dialog.getByLabel('Return quantity for Bouquet R3').fill('1');
    await dialog.getByRole('button', { name: 'Complete Return' }).click();
    await expect(dialog).toBeHidden();

    await expect(detail.locator('.sale-status')).toHaveText('Partially Returned');
    await expect(detail.getByRole('button', { name: 'Cancel Sale' })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Return Products' })).toBeVisible();
    const cancel = await pageRequest(page, 'POST', `/api/sales/${sale.id}/cancellation`, {
      cancellationDate: today(),
      reason: 'Customer Cancelled',
    });
    expect(cancel.status).toBe(400);
    expect(cancel.text).toContain('Only a completed sale without previous returns can be');
  });
});
