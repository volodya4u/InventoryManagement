import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
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
