import { expect, test, type Page } from '@playwright/test';
import { today } from './support/api';
import { signInAsAdmin } from './support/auth';
import { producedBouquet } from './support/bouquet';
import { pageRequest } from './support/page-api';
import { goTo, nameRow } from './support/ui';

const salesRow = (page: Page, text: string | RegExp) => page.locator('tbody tr').filter({ hasText: text });

test.describe('sales', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  // @trace FR-101, FR-103, FR-105, FR-107, FR-108, FR-112
  test('a sale takes its price from the product, gets a number, and moves the stock', async ({ page, baseURL }) => {
    const { api } = await producedBouquet(baseURL!, 'S1');
    await api.dispose();
    await goTo(page, 'Sales', 'Sales');

    await page.getByRole('button', { name: '+ New Sale' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Sale' });
    await dialog.getByLabel('Product *').selectOption({ label: 'BQ-S1 — Bouquet S1 — 5 available' });
    await expect(dialog.getByLabel('Actual Unit Price, ₴ *')).toHaveValue(/^89\.7/);
    await expect(dialog.getByLabel('Quantity *')).toHaveValue('1');
    await dialog.getByLabel('Quantity *').fill('2');
    await dialog.getByLabel('Payment Method *').selectOption({ label: 'Card' });
    const totals = dialog.locator('.sale-totals');
    await expect(totals).toContainText('₴179.40');
    await expect(totals).toContainText('₴138.00');
    await expect(totals).toContainText('₴41.40');
    await dialog.getByRole('button', { name: 'Complete Sale' }).click();
    await expect(dialog).toBeHidden();

    const stamp = today().replaceAll('-', '');
    const row = salesRow(page, 'Bouquet S1');
    await expect(row.locator('.sale-number')).toHaveText(new RegExp(`^SALE-${stamp}-\\d{4}$`));
    await expect(row.locator('.sale-status')).toHaveText('Completed');
    await expect(row).toContainText('Card');
    await expect(row.getByRole('cell').nth(5)).toContainText('₴179.40');

    await goTo(page, 'Products', 'Finished Products');
    await expect(nameRow(page, 'Bouquet S1').getByRole('cell').nth(3)).toHaveText('3');
  });

  // @trace FR-104, FR-112
  test('a sale for more than the stock holds is blocked on the form', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'S2');
    await api.dispose();
    await goTo(page, 'Sales', 'Sales');

    await page.getByRole('button', { name: '+ New Sale' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Sale' });
    await dialog.getByLabel('Product *').selectOption({ label: 'BQ-S2 — Bouquet S2 — 5 available' });
    await dialog.getByLabel('Quantity *').fill('10');
    await expect(dialog.getByText('The requested quantity exceeds the available Product stock.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Complete Sale' })).toBeDisabled();

    // The server refuses the same sale if it gets past the form, naming what is short, and records nothing.
    const refused = await pageRequest(page, 'POST', '/api/sales', {
      saleDate: today(),
      paymentMethod: 'CASH',
      items: [{ productId: product.id, quantity: 10, unitPrice: 90 }],
    });
    expect(refused.status).toBe(409);
    expect(refused.json).toMatchObject({ title: 'Insufficient product stock' });
    expect(refused.text).toContain('BQ-S2');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('tbody tr').filter({ hasText: 'Bouquet S2' })).toHaveCount(0);
  });

  // @trace FR-101, FR-102
  test('a sale request that breaks the rules of the sale or of an item is refused, and records nothing', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'S5');
    await api.dispose();
    await goTo(page, 'Sales', 'Sales');
    const item = { productId: product.id, quantity: 1, unitPrice: 90 };
    const request = (extra: Record<string, unknown>) =>
      pageRequest(page, 'POST', '/api/sales', { saleDate: today(), paymentMethod: 'CASH', items: [item], ...extra });

    // The sale itself: a payment method, a date, at most 1000 characters of notes, and 1 to 100 items.
    expect((await request({ paymentMethod: undefined })).status).toBe(400);
    expect((await request({ paymentMethod: 'BARTER' })).status).toBe(400);
    expect((await request({ saleDate: undefined })).status).toBe(400);
    expect((await request({ notes: 'n'.repeat(1001) })).status).toBe(400);
    expect((await request({ items: [] })).status).toBe(400);
    expect((await request({ items: Array.from({ length: 101 }, (_, i) => ({ ...item, productId: i + 1 })) })).status).toBe(400);

    // Each item: an existing product, a whole quantity above zero, a price of at least zero with two decimals.
    const sell = (changes: Record<string, number>) => request({ items: [{ ...item, ...changes }] });

    expect((await sell({ productId: 999999, quantity: 1, unitPrice: 90 })).status).toBe(404);
    expect((await sell({ productId: product.id, quantity: 1.5, unitPrice: 90 })).status).toBe(400);
    expect((await sell({ productId: product.id, quantity: 0, unitPrice: 90 })).status).toBe(400);
    expect((await sell({ productId: product.id, quantity: 1, unitPrice: -1 })).status).toBe(400);
    expect((await sell({ productId: product.id, quantity: 1, unitPrice: 90.123 })).status).toBe(400);
    await page.reload();
    await expect(page.locator('tbody tr').filter({ hasText: 'Bouquet S5' })).toHaveCount(0);
  });

  // @trace FR-106, FR-107
  test('the price charged is kept beside the recommended price, and profit follows it', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'S3');
    await api.sale([{ productId: product.id, quantity: 1, unitPrice: 60 }]);
    await api.dispose();
    await goTo(page, 'Sales', 'Sales');

    const row = salesRow(page, 'Bouquet S3');
    await expect(row.getByRole('cell').nth(7)).toContainText('-₴9.00');
    await row.getByRole('button', { name: 'View' }).click();
    const detail = page.locator('.sale-detail-dialog');
    await expect(detail).toContainText('recommended ₴89.70');
    await expect(detail.locator('tbody tr').first()).toContainText('₴60.00');
    await expect(detail.locator('.sale-totals--detail')).toContainText('-₴9.00');
  });

  // @trace FR-109, FR-110, FR-113
  test('sales are listed newest first, can be opened by link, and offer no way to edit or delete', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'S4');
    const first = await api.sale([{ productId: product.id, quantity: 1, unitPrice: 90 }]);
    const second = await api.sale([{ productId: product.id, quantity: 2, unitPrice: 90 }]);
    await api.dispose();
    await goTo(page, 'Sales', 'Sales');

    const numbers = await page.locator('.sale-number').allTextContents();
    expect(numbers.indexOf(second.saleNumber)).toBeGreaterThanOrEqual(0);
    expect(numbers.indexOf(second.saleNumber)).toBeLessThan(numbers.indexOf(first.saleNumber));
    await expect(page.getByRole('button', { name: /edit|delete|remove/i })).toHaveCount(0);
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      expect((await pageRequest(page, method, `/api/sales/${first.id}`, method === 'DELETE' ? undefined : {})).status).toBe(405);
    }

    await page.goto(`/sales?saleId=${first.id}`);
    await expect(page.getByRole('dialog', { name: first.saleNumber })).toBeVisible();
  });
});
