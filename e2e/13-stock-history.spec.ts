import { expect, test, type Page } from '@playwright/test';
import { Api, today } from './support/api';
import { signInAsAdmin } from './support/auth';
import { producedBouquet } from './support/bouquet';
import { goTo } from './support/ui';

const openHistory = (page: Page) => goTo(page, 'Stock History', 'Stock Movement History');
const rows = (page: Page) => page.locator('.movement-table-card tbody tr');
const total = (page: Page, label: string) => page.locator('.movement-summary article', { hasText: label });

async function search(page: Page, text: string) {
  await page.getByLabel('Item').fill(text);
  await page.getByRole('button', { name: 'Apply' }).click();
}

test.describe('stock history', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  // @trace FR-46, FR-63, FR-127, FR-128, FR-129, FR-132, FR-133
  test('every movement is listed with totals for the whole filter; the search finds names in any alphabet', async ({ page, baseURL }) => {
    const api = await Api.signIn(baseURL!);
    const rose = await api.rawMaterial({ name: 'Троянда Н1', unit: 'PIECE', quantity: 10, initialUnitCost: 20 });
    await api.receipt(rose.id, 5, 30);
    await api.dispose();
    await openHistory(page);

    await page.getByLabel('Inventory').selectOption({ label: 'Raw Materials' });
    await search(page, 'троянд');
    await expect(rows(page)).toHaveCount(2);
    // Newest first: the receipt, then the opening balance made when the material was created.
    await expect(rows(page).nth(0)).toContainText('Receipt');
    await expect(rows(page).nth(0)).toContainText('+5');
    await expect(rows(page).nth(0)).toContainText('+₴150.00');
    await expect(rows(page).nth(1)).toContainText('Opening Balance');
    await expect(rows(page).nth(1)).toContainText('Initial stock');
    await expect(rows(page).nth(1)).toContainText('+₴200.00');
    await expect(total(page, 'Movements')).toContainText('2');
    await expect(total(page, 'Stock Value In')).toContainText('₴350.00');
    await expect(total(page, 'Stock Value Out')).toContainText('₴0.00');
    await expect(total(page, 'Net Value Change')).toContainText('₴350.00');

    // The same rows are found by capital letters, and one movement type narrows them.
    await search(page, 'ТРОЯНД');
    await expect(rows(page)).toHaveCount(2);
    await page.getByLabel('Movement Type').selectOption({ label: 'Receipt' });
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(total(page, 'Stock Value In')).toContainText('₴150.00');
  });

  // @trace FR-134, FR-122
  test('a product movement points to its sale, and the number opens that sale', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'H2');
    const sale = await api.sale([{ productId: product.id, quantity: 1, unitPrice: 90 }]);
    await api.returnItem(sale, 1, today());
    await api.dispose();
    await openHistory(page);

    await page.getByLabel('Inventory').selectOption({ label: 'Products' });
    await search(page, 'Bouquet H2');
    // The production row points to its batch, the return row to the return and the sale it came from.
    await expect(rows(page).filter({ hasText: 'Production' })).toHaveCount(1);
    await expect(rows(page).filter({ hasText: 'Production' })).toContainText(/Batch #\d+/);
    const returnRow = rows(page).filter({ hasText: 'Sale Return' });
    await expect(returnRow).toContainText(new RegExp(`Return RET-\\d{8}-\\d{4} for ${sale.saleNumber}`));
    await expect(returnRow).toContainText(/RET-\d{8}-\d{4}/);
    const saleRow = rows(page).filter({ has: page.getByRole('link', { name: sale.saleNumber }) });
    await expect(saleRow).toContainText('-1');
    await saleRow.getByRole('link', { name: sale.saleNumber }).click();
    await expect(page).toHaveURL(new RegExp(`/sales\\?saleId=${sale.id}$`));
    await expect(page.getByRole('dialog', { name: sale.saleNumber })).toBeVisible();
  });

  // @trace FR-130, FR-131, FR-135
  test('a reversed date range is explained, and long results are paged and restart on a new filter', async ({ page, baseURL }) => {
    const api = await Api.signIn(baseURL!);
    for (let i = 1; i <= 27; i++) {
      await api.rawMaterial({ name: `Paged item ${String(i).padStart(2, '0')}`, quantity: 1, initialUnitCost: 1 });
    }
    await api.dispose();
    await openHistory(page);

    await search(page, 'Paged item');
    await expect(page.getByText('Showing 1–25 of 27')).toBeVisible();
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Showing 26–27 of 27')).toBeVisible();
    await expect(rows(page)).toHaveCount(2);

    // A new filter starts again at the first page.
    await page.getByLabel('Item').fill('Paged item 01');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('Showing 1–1 of 1')).toBeVisible();

    await page.getByLabel('From', { exact: true }).fill(today());
    await page.getByLabel('To', { exact: true }).fill('2000-01-01');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('alert')).toContainText('From date cannot be later than To date');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('Item')).toHaveValue('');
  });
});
