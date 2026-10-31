import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { Api } from './support/api';
import { signInAsAdmin } from './support/auth';
import { everySaleState } from './support/bouquet';

// WCAG 2.1 A and AA, the rule sets OQ-15 names. A serious or critical violation fails the test.
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const failingImpacts = ['serious', 'critical'];

const pages: [string, string][] = [
  ['login', 'Administrator Sign In'],
  ['dashboard', 'Inventory Overview'],
  ['raw-materials', 'Raw Materials'],
  ['products', 'Finished Products'],
  ['sales', 'Sales'],
  ['stock-movements', 'Stock Movement History'],
  ['reports/monthly-sales', 'Monthly Sales'],
  ['change-password', 'Change Password'],
];

// pnpm run check:a11y (scripts/check-a11y.mjs) sets E2E_A11Y_DIR and turns the result of every page into docs/qa/a11y-report.json.
const resultDir = process.env.E2E_A11Y_DIR;

// The application has no dark theme: the dark pass emulates `prefers-color-scheme: dark` and checks what that visitor gets.
// @trace NFR-20
test('every page passes the WCAG 2.1 AA rules in the light and the dark scheme with no serious or critical violation', async ({
  browser,
  baseURL,
}) => {
  // Sixteen pages are checked, each twice over (two schemes); Firefox and WebKit need more than the default minute.
  test.setTimeout(240_000);

  // Rows in every state a list can show, so the muted rows of cancelled and returned sales are not missed.
  await everySaleState(baseURL!, 'A11Y');

  const failures: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ baseURL, colorScheme: scheme });
    const page = await context.newPage();
    for (const [route, heading] of pages) {
      if (route === 'login') {
        await page.goto('/login');
      } else {
        if (route === 'dashboard') await signInAsAdmin(page);
        await page.goto(`/${route}`);
      }
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page }).withTags(tags).analyze();
      const violations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? 'minor',
        help: v.help,
        nodes: v.nodes.length,
        // Where to look: the first elements' selectors and axe's own message for each.
        targets: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} — ${n.any[0]?.message ?? n.failureSummary ?? ''}`),
      }));
      for (const v of violations.filter((v) => failingImpacts.includes(v.impact))) {
        failures.push(`${route} (${scheme}): ${v.impact} ${v.id} on ${v.nodes} element(s): ${v.help}\n    ${v.targets.join('\n    ')}`);
      }
      if (resultDir) {
        mkdirSync(resultDir, { recursive: true });
        writeFileSync(
          join(resultDir, `${route.replaceAll('/', '_')}.${scheme}.json`),
          JSON.stringify({ route, scheme, authenticated: route !== 'login', passes: results.passes.length, incomplete: results.incomplete.length, violations }),
        );
      }
    }
    await context.close();
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

// @trace FR-150
test('every catalog and sale dialog keeps keyboard focus inside and restores it on close', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const api = await Api.signIn(baseURL!);
  const material = await api.rawMaterial({
    name: 'Focus Rose',
    quantity: 3,
    initialUnitCost: 5,
  });
  const product = await api.product({
    sku: 'FOCUS-ROSE',
    name: 'Focus bouquet',
    recipe: [{ rawMaterialId: material.id, quantityPerUnit: 1 }],
    quantity: 3,
    initialUnitCost: 5,
  });
  const returnedSale = await api.sale([{ productId: product.id, quantity: 1, unitPrice: 15 }]);
  const cancelledSale = await api.sale([{ productId: product.id, quantity: 1, unitPrice: 15 }]);
  await api.dispose();
  await signInAsAdmin(page);

  const checkDialog = async (opener: Locator, dialogName: string) => {
    await expect(opener).toBeEnabled();
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: dialogName });
    const first = dialog.getByRole('button', { name: 'Close' }).first();
    const last = dialog.locator('button:not([disabled])').last();
    await expect(first).toBeFocused();
    await last.focus();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    await first.click();
    await expect(opener).toBeFocused();
  };

  await page.goto('/raw-materials');
  await checkDialog(page.getByRole('button', { name: '+ Add Raw Material' }), 'New Raw Material');
  const rawRow = page.getByRole('row').filter({ hasText: 'Focus Rose' });
  await checkDialog(rawRow.getByRole('button', { name: 'Receive Stock' }), 'Receive Stock');
  await checkDialog(rawRow.getByRole('button', { name: 'Write Off' }), 'Write Off Raw Material');
  await checkDialog(
    rawRow.getByRole('button', { name: 'Adjust Stock' }),
    'Adjust Raw Material Stock',
  );

  await page.goto('/products');
  await checkDialog(page.getByRole('button', { name: '+ Add Product' }), 'New Product');
  const productRow = page.getByRole('row').filter({ hasText: 'Focus bouquet' });
  await checkDialog(productRow.getByRole('button', { name: 'Produce' }), 'Produce Product');
  await checkDialog(productRow.getByRole('button', { name: 'Write Off' }), 'Write Off Product');
  await checkDialog(
    productRow.getByRole('button', { name: 'Adjust Stock' }),
    'Adjust Product Stock',
  );

  await page.goto('/sales');
  await checkDialog(page.getByRole('button', { name: '+ New Sale' }), 'New Sale');
  const returnRow = page.getByRole('row').filter({ hasText: returnedSale.saleNumber });
  await checkDialog(returnRow.getByRole('button', { name: 'View' }), returnedSale.saleNumber);
  await returnRow.getByRole('button', { name: 'View' }).click();
  const returnDetails = page.getByRole('dialog', {
    name: returnedSale.saleNumber,
  });
  await checkDialog(
    returnDetails.getByRole('button', { name: 'Return Products' }),
    'Return Products',
  );
  await checkDialog(returnDetails.getByRole('button', { name: 'Cancel Sale' }), 'Cancel Sale');

  await returnDetails.getByRole('button', { name: 'Return Products' }).click();
  const returnDialog = page.getByRole('dialog', { name: 'Return Products' });
  await returnDialog
    .getByRole('spinbutton', { name: 'Return quantity for Focus bouquet' })
    .fill('1');
  await returnDialog.getByRole('button', { name: 'Complete Return' }).click();
  await expect(returnDialog).toHaveCount(0);
  await expect(returnDetails.getByRole('button', { name: 'Close' }).first()).toBeFocused();

  await page.goto('/sales');
  const cancelRow = page.getByRole('row').filter({ hasText: cancelledSale.saleNumber });
  await cancelRow.getByRole('button', { name: 'View' }).click();
  const cancelDetails = page.getByRole('dialog', {
    name: cancelledSale.saleNumber,
  });
  await cancelDetails.getByRole('button', { name: 'Cancel Sale' }).click();
  const cancellationDialog = page.getByRole('dialog', { name: 'Cancel Sale' });
  await cancellationDialog.getByRole('button', { name: 'Confirm Cancellation' }).click();
  await expect(cancellationDialog).toHaveCount(0);
  await expect(cancelDetails.getByRole('button', { name: 'Close' }).first()).toBeFocused();
});
