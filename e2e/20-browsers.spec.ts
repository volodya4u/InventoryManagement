import { expect, test } from '@playwright/test';
import { signInAsAdmin } from './support/auth';

// OQ-8: the supported browsers are current Chromium (Chrome, Edge), Firefox and WebKit (standing in for Safari). The whole
// suite runs once per browser (playwright.config.ts has one project and server for each); this spec is the one whose
// assertions are about the browser itself: every page opens, shows its heading and raises no script or console error.
const supported = ['chromium', 'firefox', 'webkit'];

const pages: [string, string][] = [
  ['dashboard', 'Inventory Overview'],
  ['raw-materials', 'Raw Materials'],
  ['products', 'Finished Products'],
  ['sales', 'Sales'],
  ['stock-movements', 'Stock Movement History'],
  ['reports/monthly-sales', 'Monthly Sales'],
  ['change-password', 'Change Password'],
];

// @trace NFR-17
test('every page opens in the browser under test without a script or console error', async ({ page, browserName }) => {
  expect(supported).toContain(browserName);
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`script error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });

  await signInAsAdmin(page);
  for (const [route, heading] of pages) {
    await page.goto(`/${route}`);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
  expect(problems, `${browserName}: ${problems.join('\n')}`).toEqual([]);
});
