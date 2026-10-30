import { expect, test } from '@playwright/test';
import { Api, type RawMaterial } from './support/api';
import { producedBouquet } from './support/bouquet';
import { signInAsAdmin } from './support/auth';
import { goTo, nameRow } from './support/ui';

// The materials of the demo bouquet: 1 bunch of peonies (50.00), 2 metres of ribbon (8.00 each) and 1 sheet of paper
// (3.00) cost 69.00 a unit; with a markup of 30 % the selling price is 89.70.
// `tag` keeps the names apart between tests, which share one database.
async function bouquetMaterials(baseURL: string, tag = '') {
  const api = await Api.signIn(baseURL);
  const peony = await api.rawMaterial({ name: `Peony${tag}`, unit: 'BUNCH', quantity: 20, initialUnitCost: 50 });
  const ribbon = await api.rawMaterial({ name: `Satin ribbon${tag}`, unit: 'METER', quantity: 20, initialUnitCost: 8 });
  const paper = await api.rawMaterial({ name: `Kraft paper${tag}`, unit: 'PIECE', quantity: 30, initialUnitCost: 3 });
  return { api, peony, ribbon, paper };
}

const recipe = ({ peony, ribbon, paper }: { peony: RawMaterial; ribbon: RawMaterial; paper: RawMaterial }) => [
  { rawMaterialId: peony.id, quantityPerUnit: 1 },
  { rawMaterialId: ribbon.id, quantityPerUnit: 2 },
  { rawMaterialId: paper.id, quantityPerUnit: 1 },
];

test.describe('products', () => {
  // @trace FR-76, FR-78, FR-79, FR-80, FR-81, FR-82, FR-84, FR-87
  test('a product is priced as cost plus markup, with a live preview and no field to type a price', async ({ page, baseURL }) => {
    const { api } = await bouquetMaterials(baseURL!);
    await api.dispose();
    await signInAsAdmin(page);
    await goTo(page, 'Products', 'Finished Products');

    await page.getByRole('button', { name: '+ Add Product' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Product' });
    await dialog.getByLabel('SKU *').fill('BQ-001');
    await dialog.getByLabel('Name *').fill('Rose bouquet');

    // A recipe needs at least one material with a quantity above zero, and a material may appear only once.
    await dialog.getByRole('button', { name: 'Remove recipe material' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Add at least one raw material to the recipe.')).toBeVisible();
    await dialog.getByRole('button', { name: '+ Add Material' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Select a material and enter a quantity greater than zero.')).toBeVisible();
    await dialog.locator('#recipe-material-0').selectOption({ label: 'Peony — 20 Bunch available' });
    await dialog.getByRole('button', { name: '+ Add Material' }).click();
    await expect(dialog.locator('#recipe-material-1 option', { hasText: 'Peony' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Remove recipe material' }).last().click();

    const materials = [
      ['Peony — 20 Bunch available', '1'],
      ['Satin ribbon — 20 Meter available', '2'],
      ['Kraft paper — 30 Piece available', '1'],
    ];
    for (const [index, [material, quantity]] of materials.entries()) {
      // The dialog starts with one empty recipe row.
      if (index > 0) await dialog.getByRole('button', { name: '+ Add Material' }).click();
      await dialog.locator(`#recipe-material-${index}`).selectOption({ label: material });
      await dialog.locator(`#recipe-quantity-${index}`).fill(quantity);
    }
    await expect(dialog.locator('.recipe-cost')).toContainText('₴69.00');

    // More than two decimals in the markup or the advertising cost is refused on the form.
    await dialog.getByLabel('Markup, % *').fill('12.345');
    await dialog.getByLabel('Advertising Cost per Unit, ₴ *').fill('1.239');
    await dialog.getByLabel('Name *').focus();
    await expect(dialog.getByText('Enter a markup percentage between 0 and 999999.99, with at most two decimals.')).toBeVisible();
    await expect(dialog.getByText('Enter an advertising cost of 0 or more, with at most two decimals.')).toBeVisible();
    await dialog.getByLabel('Advertising Cost per Unit, ₴ *').fill('0');
    await dialog.getByLabel('Markup, % *').fill('30');
    await expect(dialog.locator('.value-preview', { hasText: 'Selling Price' })).toContainText('₴89.70');
    await expect(dialog.getByRole('spinbutton', { name: /selling price/i })).toHaveCount(0);

    // Opening stock needs a cost, which starts at the recipe's total unit cost.
    await dialog.getByLabel('Initial Stock *').fill('3');
    await expect(dialog.getByLabel('Initial Unit Cost, ₴')).toHaveValue(/^69(\.0+)?$/);
    await dialog.getByLabel('Initial Unit Cost, ₴').fill('');
    await dialog.getByLabel('Name *').focus();
    await expect(dialog.getByText('Enter the initial unit cost when initial stock is greater than zero.')).toBeVisible();
    await dialog.getByLabel('Initial Unit Cost, ₴').fill('69');
    await expect(dialog.locator('.value-preview', { hasText: 'Initial Product Stock Value' })).toContainText('₴207.00');

    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    const row = nameRow(page, 'Rose bouquet');
    await expect(row.locator('.sku')).toHaveText('BQ-001');
    await expect(row).toContainText('1 Piece Kraft paper · 1 Bunch Peony · 2 Meter Satin ribbon');
    await expect(row).toContainText('30%');
    await expect(row).toContainText('₴89.70');
    await expect(row.getByRole('cell').nth(3)).toHaveText('3');
  });

  // @trace FR-77
  test('a second product cannot reuse a SKU, whatever its letter case', async ({ page, baseURL }) => {
    const { api, ...m } = await bouquetMaterials(baseURL!, ' B');
    await api.product({ sku: 'DUP-001', name: 'First box', recipe: recipe(m) });
    await api.dispose();
    await signInAsAdmin(page);
    await goTo(page, 'Products', 'Finished Products');

    await page.getByRole('button', { name: '+ Add Product' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Product' });
    await dialog.getByLabel('SKU *').fill('dup-001');
    await dialog.getByLabel('Name *').fill('Second box');
    await dialog.locator('#recipe-material-0').selectOption({ index: 1 });
    await dialog.locator('#recipe-quantity-0').fill('1');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog.getByRole('alert')).toHaveText('A product with SKU “dup-001” already exists.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(nameRow(page, 'Second box')).toHaveCount(0);
  });

  // @trace FR-81, FR-83
  test('a saved selling price stays as saved when a material gets dearer; editing replaces the recipe but not the stock', async ({
    page,
    baseURL,
  }) => {
    const { api, peony, ...rest } = await bouquetMaterials(baseURL!, ' C');
    await api.product({
      sku: 'EDIT-001',
      name: 'Peony box',
      recipe: recipe({ peony, ...rest }),
      markupPercentage: 30,
      quantity: 2,
      initialUnitCost: 69,
    });
    await api.receipt(peony.id, 20, 100);
    await api.dispose();
    await signInAsAdmin(page);
    await goTo(page, 'Products', 'Finished Products');

    const row = nameRow(page, 'Peony box');
    await expect(row).toContainText('₴89.70');

    await row.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Product' });
    await expect(dialog.locator('.value-preview', { hasText: 'Current Product Stock' })).toContainText('2 units');
    await expect(dialog.getByLabel('Initial Stock *')).toHaveCount(0);
    // The peonies now cost 75.00 on average, so the recipe costs 94.00 and would sell for 122.20 if saved.
    await expect(dialog.locator('.value-preview', { hasText: 'Selling Price' })).toContainText('₴122.20');
    await dialog.getByLabel('Name *').fill('Peony gift box');
    await dialog.getByRole('button', { name: 'Remove recipe material' }).first().click();
    await dialog.getByLabel('Markup, % *').fill('50');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    const edited = nameRow(page, 'Peony gift box');
    await expect(edited).toContainText('1 Bunch Peony C · 2 Meter Satin ribbon C');
    await expect(edited).not.toContainText('Kraft paper');
    await expect(edited.getByRole('cell').nth(3)).toHaveText('2');
    await expect(edited).toContainText('50%');
  });

  // @trace FR-52, FR-85, FR-86
  test('delete asks first; a material in a recipe cannot be deleted until the product is', async ({ page, baseURL }) => {
    const { api, ...m } = await bouquetMaterials(baseURL!, ' D');
    await api.product({ sku: 'GONE-001', name: 'Short-lived box', recipe: recipe(m) });
    await api.dispose();
    await signInAsAdmin(page);

    await goTo(page, 'Raw Materials', 'Raw Materials');
    const prompts: string[] = [];
    let answer = true;
    page.on('dialog', async (d) => {
      prompts.push(d.message());
      if (answer) await d.accept();
      else await d.dismiss();
    });
    await nameRow(page, 'Peony D').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alert')).toContainText('Raw material “Peony D” is used in the recipe of Short-lived box.');
    await expect(nameRow(page, 'Peony D')).toHaveCount(1);

    await goTo(page, 'Products', 'Finished Products');
    answer = false;
    await nameRow(page, 'Short-lived box').getByRole('button', { name: 'Delete' }).click();
    await expect(nameRow(page, 'Short-lived box')).toHaveCount(1);
    answer = true;
    await nameRow(page, 'Short-lived box').getByRole('button', { name: 'Delete' }).click();
    await expect(nameRow(page, 'Short-lived box')).toHaveCount(0);
    expect(prompts.at(-1)).toBe('Delete product “Short-lived box”?');
    expect(prompts).toContain('Delete raw material “Peony D”?');

    await goTo(page, 'Raw Materials', 'Raw Materials');
    await nameRow(page, 'Peony D').getByRole('button', { name: 'Delete' }).click();
    await expect(nameRow(page, 'Peony D')).toHaveCount(0);
  });

  // @trace FR-85
  test('a product that has been sold cannot be deleted', async ({ page, baseURL }) => {
    const { api, product } = await producedBouquet(baseURL!, 'P85');
    await api.sale([{ productId: product.id, quantity: 1, unitPrice: 90 }]);
    await api.dispose();
    await signInAsAdmin(page);
    page.on('dialog', (d) => d.accept());
    await goTo(page, 'Products', 'Finished Products');

    await nameRow(page, 'Bouquet P85').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('alert')).toContainText('Product “Bouquet P85” cannot be deleted because it has been sold.');
    await expect(nameRow(page, 'Bouquet P85')).toHaveCount(1);
  });
});
