import { expect, type Page } from '@playwright/test';

export const adminUsername = 'admin';

// The password of the run, made by playwright.config.ts. It is never written down.
export function adminPassword(): string {
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('E2E_ADMIN_PASSWORD is not set: run the tests through playwright.config.ts');
  }
  return password;
}

export async function openSignInPage(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Administrator Sign In' })).toBeVisible();
}

export async function signIn(
  page: Page,
  credentials: { username: string; password: string } = {
    username: adminUsername,
    password: adminPassword(),
  },
): Promise<void> {
  await openSignInPage(page);
  await page.getByLabel('Username').fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Inventory Overview' })).toBeVisible();
}
