import { expect, test, type Page } from '@playwright/test';
import { Api } from './support/api';
import { signInAsAdmin } from './support/auth';
import { pageRequest } from './support/page-api';
import { goTo, nameRow } from './support/ui';

const openRawMaterials = (page: Page) => goTo(page, 'Raw Materials', 'Raw Materials');

async function addRawMaterial(
  page: Page,
  m: { name: string; unit: string; quantity: string; cost: string; reorderLevel?: string },
) {
  await page.getByRole('button', { name: '+ Add Raw Material' }).click();
  const dialog = page.getByRole('dialog', { name: 'New Raw Material' });
  await dialog.getByLabel('Name *').fill(m.name);
  await dialog.getByLabel('Unit of Measurement *').selectOption({ label: m.unit });
  await dialog.getByLabel('Initial Stock *').fill(m.quantity);
  await dialog.getByLabel('Initial Unit Cost, ₴').fill(m.cost);
  if (m.reorderLevel) await dialog.getByLabel('Reorder Level (minimum stock)').fill(m.reorderLevel);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('raw materials', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await openRawMaterials(page);
  });

  // @trace FR-42, FR-43, FR-44, FR-47, FR-48, FR-57, FR-69
  test('raw materials are added with their opening stock and listed by name with their stock value', async ({ page, baseURL }) => {
    // A name that starts with a small letter sorts among the others, not after them.
    const api = await Api.signIn(baseURL!);
    await api.rawMaterial({ name: 'carnation' });
    await api.dispose();
    await page.reload();

    await page.getByRole('button', { name: '+ Add Raw Material' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Raw Material' });
    await expect(dialog.getByLabel('Unit of Measurement *').locator('option')).toHaveText([
      'Piece',
      'Bunch',
      'Gram',
      'Kilogram',
      'Meter',
      'Package',
    ]);

    // Stock without a cost is refused on the form, and the preview follows the numbers typed in.
    await dialog.getByLabel('Name *').fill('Rose');
    await dialog.getByLabel('Unit of Measurement *').selectOption({ label: 'Bunch' });
    await dialog.getByLabel('Initial Stock *').fill('20');
    await dialog.getByLabel('Initial Unit Cost, ₴').focus();
    await dialog.getByLabel('Reorder Level (minimum stock)').focus();
    await expect(dialog.getByText('Enter the initial unit cost when initial stock is greater than zero.')).toBeVisible();
    await dialog.getByLabel('Initial Unit Cost, ₴').fill('50.00');
    await expect(dialog.locator('.value-preview')).toContainText('₴1,000.00');
    await dialog.getByLabel('Reorder Level (minimum stock)').fill('5');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    await addRawMaterial(page, { name: 'Ribbon', unit: 'Meter', quantity: '10', cost: '8.00' });
    await addRawMaterial(page, { name: 'Wrapping paper', unit: 'Piece', quantity: '30', cost: '3.00' });

    await expect(page.locator('tbody tr td.name-column strong')).toHaveText(['carnation', 'Ribbon', 'Rose', 'Wrapping paper']);
    const stockValue = (name: string) => nameRow(page, name).getByRole('cell').nth(5);
    await expect(stockValue('Ribbon')).toHaveText('₴80.00');
    await expect(stockValue('Rose')).toHaveText('₴1,000.00');
    await expect(stockValue('Wrapping paper')).toHaveText('₴90.00');
    await expect(page.locator('tfoot')).toContainText('₴1,170.00');
  });

  // @trace FR-49, FR-50, FR-51
  test('the unit of a material that has stock is locked, and an unused one can still change', async ({ page, baseURL }) => {
    const api = await Api.signIn(baseURL!);
    await api.rawMaterial({ name: 'Moss', unit: 'PIECE' });
    await api.dispose();
    await page.reload();

    await nameRow(page, 'Rose').getByRole('button', { name: 'Edit' }).click();
    const locked = page.getByRole('dialog', { name: 'Edit Raw Material' });
    await expect(locked.getByLabel('Unit of Measurement *')).toBeDisabled();
    await expect(locked.getByText('The unit can’t change once stock, stock history, or recipes use it.')).toBeVisible();
    await expect(locked.getByText('Use Receive Stock to change quantity and inventory value.')).toBeVisible();
    await locked.getByRole('button', { name: 'Cancel' }).click();
    // The server holds the same line when a request tries to change that unit anyway.
    const list = await pageRequest(page, 'GET', '/api/raw-materials');
    const rose = (JSON.parse(list.text) as { id: number; name: string }[]).find((m) => m.name === 'Rose')!;
    const changed = await pageRequest(page, 'PUT', `/api/raw-materials/${rose.id}`, undefined, {
      name: 'Rose',
      description: '',
      unit: 'GRAM',
      reorderLevel: '5',
    });
    expect(changed.status).toBe(409);
    expect(changed.text).toContain('cannot be changed because stock, stock history, or recipes already use it');

    await nameRow(page, 'Moss').getByRole('button', { name: 'Edit' }).click();
    const open = page.getByRole('dialog', { name: 'Edit Raw Material' });
    await expect(open.getByLabel('Unit of Measurement *')).toBeEnabled();
    await open.getByLabel('Name *').fill('Sphagnum moss');
    await open.getByLabel('Unit of Measurement *').selectOption({ label: 'Gram' });
    await open.getByRole('button', { name: 'Save' }).click();
    await expect(open).toBeHidden();
    await expect(nameRow(page, 'Sphagnum moss')).toContainText('Gram');
  });

  // @trace FR-54, FR-55, FR-56
  test('deleting asks first, removes an unused material, and names may repeat', async ({ page, baseURL }) => {
    const api = await Api.signIn(baseURL!);
    await api.rawMaterial({ name: 'Twine' });
    await api.rawMaterial({ name: 'Twine' });
    await api.dispose();
    await page.reload();
    await expect(nameRow(page, 'Twine')).toHaveCount(2);

    const prompts: string[] = [];
    page.on('dialog', async (d) => {
      prompts.push(d.message());
      if (prompts.length === 1) await d.dismiss();
      else await d.accept();
    });
    await nameRow(page, 'Twine').first().getByRole('button', { name: 'Delete' }).click();
    await expect(nameRow(page, 'Twine')).toHaveCount(2);

    await nameRow(page, 'Twine').first().getByRole('button', { name: 'Delete' }).click();
    await expect(nameRow(page, 'Twine')).toHaveCount(1);
    expect(prompts).toEqual(['Delete raw material “Twine”?', 'Delete raw material “Twine”?']);
  });
});
