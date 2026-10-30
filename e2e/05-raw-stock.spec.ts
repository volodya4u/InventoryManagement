import { expect, test } from '@playwright/test';
import { Api, today } from './support/api';
import { signInAsAdmin } from './support/auth';
import { pageRequest } from './support/page-api';
import { goTo, nameRow } from './support/ui';

test.describe('raw material stock', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  // @trace FR-61, FR-62, FR-69
  test('a receipt shows its value first and re-averages the unit cost', async ({ page, baseURL }) => {
    const api = await Api.signIn(baseURL!);
    await api.rawMaterial({ name: 'Rose R1', unit: 'BUNCH', quantity: 20, initialUnitCost: 50 });
    await api.dispose();
    await goTo(page, 'Raw Materials', 'Raw Materials');

    const row = nameRow(page, 'Rose R1');
    await expect(row.getByRole('cell').nth(4)).toHaveText('₴50.00');
    await row.getByRole('button', { name: 'Receive Stock' }).click();
    const dialog = page.getByRole('dialog', { name: 'Receive Stock' });
    await dialog.getByLabel('Received Quantity *').fill('10');
    await dialog.getByLabel('Unit Purchase Cost, ₴ *').fill('60');
    await expect(dialog.locator('.value-preview')).toContainText('₴600.00');
    await dialog.getByLabel('Notes').fill('Second delivery');
    await dialog.getByRole('button', { name: 'Receive Stock' }).click();
    await expect(dialog).toBeHidden();

    // (20 x 50.00 + 10 x 60.00) / 30 = 53.3333
    await expect(row.getByRole('cell').nth(3)).toHaveText('30');
    await expect(row.getByRole('cell').nth(4)).toHaveText('₴53.33');
    await expect(row.getByRole('cell').nth(5)).toHaveText('₴1,600.00');
  });

  // @trace FR-58, FR-59, FR-64, FR-65
  test('a write-off to the reorder level raises the low-stock flag, and cannot take more than there is', async ({ page, baseURL }) => {
    const api = await Api.signIn(baseURL!);
    const rose = await api.rawMaterial({ name: 'Rose R2', unit: 'BUNCH', quantity: 20, initialUnitCost: 50, reorderLevel: 5 });
    await api.dispose();
    await goTo(page, 'Raw Materials', 'Raw Materials');

    const row = nameRow(page, 'Rose R2');
    await expect(row.getByText('Low stock')).toHaveCount(0);
    await row.getByRole('button', { name: 'Write Off' }).click();
    const dialog = page.getByRole('dialog', { name: 'Write Off Raw Material' });
    await dialog.getByLabel('Quantity to Write Off *').fill('99');
    await expect(dialog.getByText('The write-off quantity exceeds available stock.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirm Write-Off' })).toBeDisabled();
    // The server gives the same answer to a request that gets past the form, and changes nothing.
    const refused = await pageRequest(page, 'POST', `/api/raw-materials/${rose.id}/write-offs`, {
      quantity: 99,
      operationDate: today(),
      reason: 'Damaged',
    });
    expect(refused.status).toBe(409);
    expect(refused.json).toMatchObject({ title: 'Insufficient raw material stock' });
    await expect(row.getByRole('cell').nth(3)).toHaveText('20');

    await dialog.getByLabel('Quantity to Write Off *').fill('15');
    await dialog.getByLabel('Reason *').selectOption({ label: 'Spoiled or Expired' });
    await expect(dialog.locator('.operation-preview')).toContainText('₴750.00');
    await dialog.getByRole('button', { name: 'Confirm Write-Off' }).click();
    await expect(dialog).toBeHidden();

    // 5 left with a reorder level of 5: the boundary counts as low.
    await expect(row.getByRole('cell').nth(3)).toHaveText('5');
    await expect(row.getByText('Low stock')).toBeVisible();
  });

  // @trace FR-68
  test('fractional quantities subtract exactly', async ({ page, baseURL }) => {
    const api = await Api.signIn(baseURL!);
    await api.rawMaterial({ name: 'Ribbon R3', unit: 'METER', quantity: 1, initialUnitCost: 8 });
    await api.dispose();
    await goTo(page, 'Raw Materials', 'Raw Materials');

    const row = nameRow(page, 'Ribbon R3');
    for (const quantity of ['0.1', '0.2']) {
      await row.getByRole('button', { name: 'Write Off' }).click();
      const dialog = page.getByRole('dialog', { name: 'Write Off Raw Material' });
      await dialog.getByLabel('Quantity to Write Off *').fill(quantity);
      await dialog.getByRole('button', { name: 'Confirm Write-Off' }).click();
      await expect(dialog).toBeHidden();
    }

    // 1 - 0.1 - 0.2 is 0.7, not 0.7000000000000001.
    await expect(row.getByRole('cell').nth(3)).toHaveText('0.7');
  });

  // @trace FR-66, FR-67
  test('an adjustment records the difference to the counted stock and refuses a count that changes nothing', async ({ page, baseURL }) => {
    const api = await Api.signIn(baseURL!);
    const paper = await api.rawMaterial({ name: 'Paper R4', unit: 'PIECE', quantity: 8, initialUnitCost: 3 });
    await api.dispose();
    await goTo(page, 'Raw Materials', 'Raw Materials');

    const row = nameRow(page, 'Paper R4');
    await row.getByRole('button', { name: 'Adjust Stock' }).click();
    const dialog = page.getByRole('dialog', { name: 'Adjust Raw Material Stock' });
    await dialog.getByLabel('Actual Counted Stock *').fill('8');
    await expect(dialog.getByText('The counted quantity already matches the recorded stock.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save Adjustment' })).toBeDisabled();
    const refused = await pageRequest(page, 'POST', `/api/raw-materials/${paper.id}/adjustments`, {
      actualQuantity: 8,
      operationDate: today(),
      reason: 'Physical Inventory Count',
    });
    expect(refused.status).toBe(400);
    expect(refused.text).toContain('Actual stock already matches the recorded raw material stock');

    await dialog.getByLabel('Actual Counted Stock *').fill('6');
    await dialog.getByLabel('Reason *').selectOption({ label: 'Physical Inventory Count' });
    await expect(dialog.locator('.operation-preview')).toContainText('-2');
    await dialog.getByRole('button', { name: 'Save Adjustment' }).click();
    await expect(dialog).toBeHidden();

    await expect(row.getByRole('cell').nth(3)).toHaveText('6');
    await expect(row.getByRole('cell').nth(5)).toHaveText('₴18.00');
  });

  // @trace FR-58, FR-60
  test('a reorder level only raises the flag: stock, cost, value and history stay as they were', async ({ page, baseURL }) => {
    const api = await Api.signIn(baseURL!);
    await api.rawMaterial({ name: 'Tulip R5', unit: 'BUNCH', quantity: 20, initialUnitCost: 50 });
    await api.dispose();
    await goTo(page, 'Raw Materials', 'Raw Materials');

    const row = nameRow(page, 'Tulip R5');
    const expectUnchanged = async () => {
      await expect(row.getByRole('cell').nth(3)).toHaveText('20');
      await expect(row.getByRole('cell').nth(4)).toHaveText('₴50.00');
      await expect(row.getByRole('cell').nth(5)).toHaveText('₴1,000.00');
    };
    await expectUnchanged();
    await expect(row.getByText('Low stock')).toHaveCount(0);

    await row.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Raw Material' });
    await dialog.getByLabel('Reorder Level (minimum stock)').fill('30');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    await expect(row.getByText('Low stock')).toBeVisible();
    await expectUnchanged();
    await goTo(page, 'Stock History', 'Stock Movement History');
    await page.getByLabel('Item').fill('Tulip R5');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.movement-table-card tbody tr')).toHaveCount(1);
    await expect(page.locator('.movement-table-card tbody tr')).toContainText('Opening Balance');
  });
});
