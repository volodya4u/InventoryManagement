import { expect, test } from '@playwright/test';
import { signInAsAdmin } from './support/auth';

test.describe('shell', () => {
  // @trace FR-33, FR-34
  test('every page can be reloaded or opened by its address, and unknown addresses lead to the overview', async ({ page }) => {
    await signInAsAdmin(page);

    const pages: [string, string][] = [
      ['/dashboard', 'Inventory Overview'],
      ['/raw-materials', 'Raw Materials'],
      ['/products', 'Finished Products'],
      ['/sales', 'Sales'],
      ['/stock-movements', 'Stock Movement History'],
      ['/reports/monthly-sales', 'Monthly Sales'],
      ['/change-password', 'Change Password'],
    ];
    for (const [path, heading] of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }

    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    // An unknown address typed into the browser is the server's to answer; inside the running app the router sends it to
    // the overview, which is what following a stale in-app link does.
    await page.evaluate(() => {
      history.pushState({}, '', '/no-such-page');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Inventory Overview' })).toBeVisible();
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    // @trace FR-35
    test('the menu opens from its button and closes when a page is chosen', async ({ page }) => {
      await signInAsAdmin(page);
      const toggle = page.getByRole('button', { name: 'Open menu' });
      const nav = page.getByRole('navigation', { name: 'Main navigation' });

      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(nav.getByRole('link', { name: 'Products', exact: true })).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(nav.getByRole('link', { name: 'Products', exact: true })).toBeVisible();

      await nav.getByRole('link', { name: 'Products', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Finished Products', level: 1 })).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(nav.getByRole('link', { name: 'Products', exact: true })).toBeHidden();
    });
  });
});
