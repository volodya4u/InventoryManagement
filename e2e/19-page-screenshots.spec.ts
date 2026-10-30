import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { signInAsAdmin } from './support/auth';
import { everySaleState } from './support/bouquet';

// The screenshots that scripts/check-vision.mjs hands to the vision judge (NFR-18). The script sets E2E_VISION_DIR and turns
// the files into docs/qa/vision/; a normal run skips this spec.
const outputDir = process.env.E2E_VISION_DIR;

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

const widths = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

// Same file names as check-vision.mjs: the route with its slashes turned into dashes, then the width.
const shotId = (route: string, width: number) => `${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}-${width}`;

test.skip(!outputDir, 'run through scripts/check-vision.mjs capture');

for (const viewport of widths) {
  test(`every page at ${viewport.width}px, in the light and the dark scheme`, async ({ page, baseURL }) => {
    mkdirSync(outputDir!, { recursive: true });
    await page.setViewportSize(viewport);
    await everySaleState(baseURL!, `V${viewport.width}`);

    for (const [route, heading] of pages) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        if (route === 'login') {
          await page.goto('/login');
        } else {
          if (route === 'dashboard' && scheme === 'light') await signInAsAdmin(page);
          await page.goto(`/${route}`);
        }
        await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: join(outputDir!, `${shotId(route, viewport.width)}.${scheme}.png`), fullPage: true });
      }
    }
  });
}
