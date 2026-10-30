import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from './support/auth';

const pages: [string, string][] = [
  ['/dashboard', 'Inventory Overview'],
  ['/raw-materials', 'Raw Materials'],
  ['/products', 'Finished Products'],
  ['/sales', 'Sales'],
  ['/stock-movements', 'Stock Movement History'],
  ['/reports/monthly-sales', 'Monthly Sales'],
  ['/change-password', 'Change Password'],
];

// The page itself must not scroll sideways; a wide table scrolls inside its own frame.
const overflowsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

// The widths the layout is built for: a phone and a tablet (NFR-18 leaves the supported devices open; these two sizes
// are what the manual test plan uses). The earlier specs left data in every list, so the tables are not empty.
for (const [name, viewport] of [
  ['phone', { width: 375, height: 812 }],
  ['tablet', { width: 768, height: 1024 }],
] as const) {
  test.describe(`on a ${name}`, () => {
    test.use({ viewport });

    // @trace NFR-18
    test(`every page fits the ${name} width without scrolling sideways`, async ({ page }) => {
      await signInAsAdmin(page);
      for (const [path, heading] of pages) {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await overflowsSideways(page), `${path} scrolls sideways at ${viewport.width}px`).toBe(false);
      }
    });
  });
}
