import { expect, test } from '@playwright/test';
import { Api, today } from './support/api';
import { signInAsAdmin } from './support/auth';
import { pageRequest } from './support/page-api';
import { goTo, nameRow } from './support/ui';

// Five finished units already in stock at 69.00 each.
async function stockedProduct(baseURL: string, tag: string): Promise<number> {
  const api = await Api.signIn(baseURL);
  const material = await api.rawMaterial({ name: `Stem ${tag}`, quantity: 10, initialUnitCost: 5 });
  const product = await api.product({
    sku: `STK-${tag}`,
    name: `Posy ${tag}`,
    quantity: 5,
    initialUnitCost: 69,
    recipe: [{ rawMaterialId: material.id, quantityPerUnit: 1 }],
  });
  await api.dispose();
  return product.id;
}

test.describe('product stock', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await goTo(page, 'Products', 'Finished Products');
  });

  // @trace FR-95, FR-96, FR-97, FR-100
  test('a write-off takes whole units out of stock and cannot take more than there is', async ({ page, baseURL }) => {
    const id = await stockedProduct(baseURL!, 'W');
    await page.reload();
    const row = nameRow(page, 'Posy W');

    await row.getByRole('button', { name: 'Write Off' }).click();
    const dialog = page.getByRole('dialog', { name: 'Write Off Product' });
    await expect(dialog.getByText('current stock: 5 units')).toBeVisible();

    await dialog.getByLabel('Quantity to Write Off *').fill('9');
    await expect(dialog.getByText('The write-off quantity exceeds available Product stock.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirm Write-Off' })).toBeDisabled();
    // The server refuses the same request if it gets past the form, and changes nothing.
    const refused = await pageRequest(page, 'POST', `/api/products/${id}/write-offs`, {
      quantity: 9,
      operationDate: today(),
      reason: 'Damaged',
    });
    expect(refused.status).toBe(409);
    expect(refused.json).toMatchObject({ title: 'Insufficient product stock' });
    await expect(row.getByRole('cell').nth(3)).toHaveText('5');

    await dialog.getByLabel('Quantity to Write Off *').fill('1.5');
    await dialog.getByLabel('Operation Date *').focus();
    await expect(dialog.getByText('Enter a positive whole number.')).toBeVisible();

    await dialog.getByLabel('Quantity to Write Off *').fill('2');
    await dialog.getByLabel('Reason *').selectOption({ label: 'Damaged' });
    await expect(dialog.locator('.operation-preview')).toContainText('New Stock');
    await dialog.getByRole('button', { name: 'Confirm Write-Off' }).click();
    await expect(dialog).toBeHidden();

    await expect(row.getByRole('cell').nth(3)).toHaveText('3');
    await expect(row.getByRole('cell').nth(5)).toHaveText('₴207.00');
  });

  // @trace FR-98, FR-99, FR-100
  test('an adjustment sets the stock to the counted number and refuses a count that changes nothing', async ({ page, baseURL }) => {
    const id = await stockedProduct(baseURL!, 'A');
    await page.reload();
    const row = nameRow(page, 'Posy A');

    await row.getByRole('button', { name: 'Adjust Stock' }).click();
    const dialog = page.getByRole('dialog', { name: 'Adjust Product Stock' });
    await dialog.getByLabel('Actual Counted Stock *').fill('5');
    await expect(dialog.getByText('The counted quantity already matches the recorded Product stock.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save Adjustment' })).toBeDisabled();
    const refused = await pageRequest(page, 'POST', `/api/products/${id}/adjustments`, {
      actualQuantity: 5,
      operationDate: today(),
      reason: 'Physical Inventory Count',
    });
    expect(refused.status).toBe(400);
    expect(refused.text).toContain('Actual stock already matches the recorded Product stock');

    await dialog.getByLabel('Actual Counted Stock *').fill('7');
    await dialog.getByLabel('Reason *').selectOption({ label: 'Physical Inventory Count' });
    await expect(dialog.locator('.operation-preview')).toContainText('+2');
    await dialog.getByRole('button', { name: 'Save Adjustment' }).click();
    await expect(dialog).toBeHidden();

    await expect(row.getByRole('cell').nth(3)).toHaveText('7');
    // A counted increase corrects the balance and is not a production: no raw material is used up.
    await goTo(page, 'Raw Materials', 'Raw Materials');
    await expect(nameRow(page, 'Stem A').getByRole('cell').nth(3)).toHaveText('10');
  });
});
