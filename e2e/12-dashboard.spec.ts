import { expect, test, type Page } from '@playwright/test';
import { Api, today } from './support/api';
import { signInAsAdmin } from './support/auth';
import { producedBouquet } from './support/bouquet';

const card = (page: Page, label: string) => page.locator('.stat-card').filter({ has: page.getByText(label, { exact: true }) });

// What the summary should say, counted from the lists the other pages show rather than from the summary call itself.
async function expectedSummary(baseURL: string) {
  const api = await Api.signIn(baseURL);
  const materials = (await (await api.get('/api/raw-materials')).json()) as { quantity: number; belowReorderLevel: boolean }[];
  const products = (await (await api.get('/api/products')).json()) as { quantity: number }[];
  const sales = (await (await api.get('/api/sales')).json()) as { status: string }[];
  await api.dispose();
  return {
    rawMaterialTypes: materials.length,
    productTypes: products.length,
    productUnits: products.reduce((sum, p) => sum + p.quantity, 0),
    lowStock: materials.filter((m) => m.belowReorderLevel).length,
    sales: sales.filter((s) => s.status === 'COMPLETED' || s.status === 'PARTIALLY_RETURNED').length,
    cancelledOrReturned: sales.filter((s) => s.status === 'CANCELLED' || s.status === 'RETURNED').length,
  };
}

test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  // @trace FR-37, FR-38, FR-39, FR-40
  test('the overview counts materials, products, units, sales and low-stock materials', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'D1', 6);
    // One completed sale, one cancelled and one returned in full (neither counted), and a material exactly at its reorder level (counted).
    await api.sale([{ productId: product.id, quantity: 1, unitPrice: 90 }]);
    const cancelled = await api.sale([{ productId: product.id, quantity: 1, unitPrice: 90 }]);
    await api.cancel(cancelled, today());
    const returned = await api.sale([{ productId: product.id, quantity: 1, unitPrice: 90 }]);
    await api.returnItem(returned, 1, today());
    await api.rawMaterial({ name: 'At the reorder level D1', quantity: 5, initialUnitCost: 1, reorderLevel: 5 });
    await api.rawMaterial({ name: 'Not tracked D1', quantity: 0, reorderLevel: 0 });
    await api.dispose();
    const expected = await expectedSummary(baseURL!);
    expect(expected.cancelledOrReturned).toBeGreaterThan(0);
    expect(expected.lowStock).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Inventory Overview' })).toBeVisible();
    await expect(card(page, 'Raw Material Types').locator('strong')).toHaveText(String(expected.rawMaterialTypes));
    await expect(card(page, 'Product Types').locator('strong')).toHaveText(String(expected.productTypes));
    await expect(card(page, 'Finished Product Units').locator('strong')).toHaveText(String(expected.productUnits));
    await expect(card(page, 'Sales').locator('strong')).toHaveText(String(expected.sales));
    await expect(card(page, 'Low Stock').locator('strong')).toHaveText(String(expected.lowStock));
  });

  // @trace FR-41
  test('when the summary cannot be loaded, the overview says why and can be reloaded', async ({ page }) => {
    await page.route('**/api/dashboard', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ title: 'Summary failed', detail: 'The summary could not be loaded.' }),
      }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('The summary could not be loaded.');
    await expect(card(page, 'Sales').locator('strong')).toHaveText('—');

    await page.unroute('**/api/dashboard');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(card(page, 'Sales').locator('strong')).not.toHaveText('—');
  });
});
