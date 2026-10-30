import { expect, test } from '@playwright/test';
import { signInAsAdmin } from './support/auth';
import { goTo, nameRow } from './support/ui';

// A valid 1 x 1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('images', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await goTo(page, 'Raw Materials', 'Raw Materials');
  });

  // @trace FR-75
  test('the form refuses a file of another type or over 2 MB before anything is sent', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add Raw Material' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Raw Material' });

    await dialog.getByLabel('Image').setInputFiles({ name: 'photo.gif', mimeType: 'image/gif', buffer: PNG });
    await expect(dialog.getByText('Select a JPG, JPEG, or PNG file.')).toBeVisible();

    await dialog.getByLabel('Image').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
    await expect(dialog.getByText('The image size cannot exceed 2 MB.')).toBeVisible();

    await dialog.getByLabel('Image').setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: PNG });
    await expect(dialog.locator('.invalid-feedback')).toHaveCount(0);
  });

  // @trace FR-73, FR-74
  test('a stored image is shown in the list, and an edit without a new file keeps it', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add Raw Material' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Raw Material' });
    await dialog.getByLabel('Name *').fill('Pictured rose');
    await dialog.getByLabel('Image').setInputFiles({ name: 'rose.png', mimeType: 'image/png', buffer: PNG });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    const picture = nameRow(page, 'Pictured rose').locator('img.item-image');
    await expect(picture).toBeVisible();
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    await expect(picture).toHaveAttribute('src', /\/api\/raw-materials\/\d+\/image/);

    await nameRow(page, 'Pictured rose').getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Raw Material' });
    await expect(edit.getByText('the current image will be kept unless you select a new file')).toBeVisible();
    await edit.getByLabel('Name *').fill('Pictured rose, renamed');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit).toBeHidden();

    await expect(nameRow(page, 'Pictured rose, renamed').locator('img.item-image')).toBeVisible();
  });
});
