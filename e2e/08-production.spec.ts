import { expect, test } from '@playwright/test';
import { Api } from './support/api';
import { signInAsAdmin } from './support/auth';
import { goTo, nameRow } from './support/ui';

// A product whose recipe is 1 peony bunch (50.00), 2 ribbon metres (8.00 each) and 1 sheet of paper (3.00): 69.00 a unit.
async function bouquet(baseURL: string, tag: string) {
  const api = await Api.signIn(baseURL);
  const peony = await api.rawMaterial({ name: `Peony ${tag}`, unit: 'BUNCH', quantity: 20, initialUnitCost: 50 });
  const ribbon = await api.rawMaterial({ name: `Ribbon ${tag}`, unit: 'METER', quantity: 20, initialUnitCost: 8 });
  const paper = await api.rawMaterial({ name: `Paper ${tag}`, unit: 'PIECE', quantity: 30, initialUnitCost: 3 });
  const product = await api.product({
    sku: `PRD-${tag}`,
    name: `Bouquet ${tag}`,
    markupPercentage: 30,
    recipe: [
      { rawMaterialId: peony.id, quantityPerUnit: 1 },
      { rawMaterialId: ribbon.id, quantityPerUnit: 2 },
      { rawMaterialId: paper.id, quantityPerUnit: 1 },
    ],
  });
  return { api, peony, ribbon, paper, product };
}

test.describe('production', () => {
  // @trace FR-88, FR-89, FR-90, FR-92, FR-94
  test('production shows what it needs, uses the materials up, and is refused when a material is short', async ({ page, baseURL }) => {
    const { api } = await bouquet(baseURL!, 'P1');
    await api.dispose();
    await signInAsAdmin(page);
    await goTo(page, 'Products', 'Finished Products');

    await nameRow(page, 'Bouquet P1').getByRole('button', { name: 'Produce' }).click();
    const dialog = page.getByRole('dialog', { name: 'Produce Product' });
    await dialog.getByLabel('Quantity to Produce *').fill('5');
    const need = (material: string) => dialog.getByRole('row', { name: new RegExp(material) });
    await expect(need('Peony P1')).toContainText('5 Bunch');
    await expect(need('Peony P1')).toContainText('20 Bunch');
    await expect(need('Peony P1')).toContainText('Available');
    await expect(need('Ribbon P1')).toContainText('10 Meter');
    await expect(dialog.locator('.production-cost')).toContainText('₴345.00');
    await dialog.getByRole('button', { name: 'Produce Product' }).click();
    await expect(dialog).toBeHidden();

    const row = nameRow(page, 'Bouquet P1');
    await expect(row.getByRole('cell').nth(3)).toHaveText('5');
    await expect(row.getByRole('cell').nth(4)).toHaveText('₴69.00');

    // Too many: every short material is named, and nothing can be sent.
    await row.getByRole('button', { name: 'Produce' }).click();
    await dialog.getByLabel('Quantity to Produce *').fill('1000');
    await expect(need('Peony P1')).toContainText('Missing 985');
    await expect(need('Ribbon P1')).toContainText('Missing 1990');
    await expect(dialog.getByRole('button', { name: 'Produce Product' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await goTo(page, 'Raw Materials', 'Raw Materials');
    await expect(nameRow(page, 'Peony P1').getByRole('cell').nth(3)).toHaveText('15');
    await expect(nameRow(page, 'Ribbon P1').getByRole('cell').nth(3)).toHaveText('10');
    await expect(nameRow(page, 'Paper P1').getByRole('cell').nth(3)).toHaveText('25');
  });

  // @trace FR-91, FR-92
  test('a second batch at dearer materials blends into the product average cost', async ({ page, baseURL }) => {
    const { api, peony, product } = await bouquet(baseURL!, 'P2');
    await api.produce(product.id, 5);
    // 15 peony bunches at 50.00 plus 20 at 100.00: the average becomes 78.5714.
    await api.receipt(peony.id, 20, 100);
    await api.dispose();
    await signInAsAdmin(page);
    await goTo(page, 'Products', 'Finished Products');
    await expect(nameRow(page, 'Bouquet P2').getByRole('cell').nth(4)).toHaveText('₴69.00');

    await nameRow(page, 'Bouquet P2').getByRole('button', { name: 'Produce' }).click();
    const dialog = page.getByRole('dialog', { name: 'Produce Product' });
    await dialog.getByLabel('Quantity to Produce *').fill('5');
    // 5 x 78.5714 + 10 metres x 8.00 + 5 sheets x 3.00 = 487.86
    await expect(dialog.locator('.production-cost')).toContainText('₴487.86');
    await dialog.getByRole('button', { name: 'Produce Product' }).click();
    await expect(dialog).toBeHidden();

    // (5 x 69.00 + 487.857) / 10 = 83.2857
    const row = nameRow(page, 'Bouquet P2');
    await expect(row.getByRole('cell').nth(3)).toHaveText('10');
    await expect(row.getByRole('cell').nth(4)).toHaveText('₴83.29');
    // The recipe still lists the same materials: the first batch kept the cost it was made at.
    await expect(row).toContainText('1 Bunch Peony P2');
  });

  // @trace FR-93
  test('editing a recipe changes later batches only: the earlier batch keeps what it used', async ({ page, baseURL }) => {
    const { api, product } = await bouquet(baseURL!, 'P4');
    await api.produce(product.id, 2);
    await signInAsAdmin(page);
    page.on('dialog', (d) => d.accept());

    // Three peonies a bouquet from now on (the rows follow the materials' names: paper, peony, ribbon).
    await goTo(page, 'Products', 'Finished Products');
    await nameRow(page, 'Bouquet P4').getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Product' });
    await dialog.locator('#recipe-quantity-1').fill('3');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await api.produce(product.id, 1);
    await api.dispose();

    await goTo(page, 'Stock History', 'Stock Movement History');
    await page.getByLabel('Movement Type').selectOption({ label: 'Production Consumption' });
    await page.getByLabel('Item').fill('Peony P4');
    await page.getByRole('button', { name: 'Apply' }).click();
    const rows = page.locator('.movement-table-card tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('-3');
    await expect(rows.nth(1)).toContainText('-2');
  });

  // @trace FR-53, FR-83
  test('a material that production has used cannot be deleted, even after it leaves the recipe', async ({ page, baseURL }) => {
    const { api, product } = await bouquet(baseURL!, 'P3');
    await api.produce(product.id, 1);
    await api.dispose();
    await signInAsAdmin(page);
    page.on('dialog', (d) => d.accept());

    // Take the peonies out of the recipe (the rows follow the materials' names: paper, peony, ribbon).
    await goTo(page, 'Products', 'Finished Products');
    await nameRow(page, 'Bouquet P3').getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Product' });
    await dialog.getByRole('button', { name: 'Remove recipe material' }).nth(1).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(nameRow(page, 'Bouquet P3')).not.toContainText('Peony P3');

    await goTo(page, 'Raw Materials', 'Raw Materials');
    await nameRow(page, 'Peony P3').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alert')).toContainText('cannot be deleted because production batches have consumed it');
    await expect(nameRow(page, 'Peony P3')).toHaveCount(1);
  });
});
