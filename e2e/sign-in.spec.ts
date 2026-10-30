import { expect, test } from '@playwright/test';
import { adminUsername, signIn, signInAsAdmin } from './support/auth';

test.describe('sign in and out', () => {
  // @trace FR-3
  test('a wrong password is refused with the single generic message and stays on the sign-in page', async ({
    page,
  }) => {
    await signIn(page, { username: adminUsername, password: 'not-the-password' });

    await expect(page.getByRole('alert')).toHaveText('Invalid username or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  // @trace FR-1, FR-9
  test('the administrator signs in to the dashboard and signs out again', async ({ page }) => {
    await signInAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: 'Sign Out' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Administrator Sign In' })).toBeVisible();
  });
});
