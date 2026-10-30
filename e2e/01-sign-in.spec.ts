import { expect, test } from '@playwright/test';
import { adminPassword, adminUsername, openSignInPage, signIn, signInAsAdmin } from './support/auth';

test.describe('sign in and out', () => {
  // @trace FR-20
  test('the form starts with the administrator name, trims it, and does not send an empty password', async ({ page }) => {
    await openSignInPage(page);
    await expect(page.getByLabel('Username')).toHaveValue(adminUsername);

    const logins: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/login')) logins.push(request.postData() ?? '');
    });
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    expect(logins).toEqual([]);

    await page.getByLabel('Username').fill(`  ${adminUsername}  `);
    await page.getByLabel('Password', { exact: true }).fill(adminPassword());
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Inventory Overview' })).toBeVisible();
    expect(JSON.parse(logins[0]).username).toBe(adminUsername);
  });

  // @trace FR-22
  test('the password can be shown, and hides itself again after five seconds', async ({ page }) => {
    await page.clock.install();
    await openSignInPage(page);
    const password = page.getByLabel('Password', { exact: true });
    await password.fill('typed secretly');
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.clock.fastForward(4000);
    await expect(password).toHaveAttribute('type', 'text');
    await page.clock.fastForward(1500);
    await expect(password).toHaveAttribute('type', 'password');
  });

  // @trace FR-3, FR-21
  test('a wrong password is refused with the single generic message and stays on the sign-in page', async ({
    page,
  }) => {
    await signIn(page, { username: adminUsername, password: 'not-the-password' });

    await expect(page.getByRole('alert')).toHaveText('Invalid username or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  // @trace FR-2
  test('the user name is matched whatever its letter case', async ({ page }) => {
    await signIn(page, { username: adminUsername.toUpperCase(), password: adminPassword() });

    await expect(page.getByRole('heading', { name: 'Inventory Overview' })).toBeVisible();
  });

  // The account exists because the application created it at its first start with the password given in the environment.
  // @trace FR-1, FR-9, FR-17
  test('the administrator signs in to the dashboard and signs out again', async ({ page }) => {
    await signInAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: 'Sign Out' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Administrator Sign In' })).toBeVisible();
  });
});
