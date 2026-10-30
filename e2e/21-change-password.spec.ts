import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { adminPassword, adminUsername, signIn, signInAsAdmin } from './support/auth';
import { goTo } from './support/ui';

// This spec runs last: it changes the administrator's password, which the other specs sign in with.
test.describe('change password', () => {
  // @trace FR-10, FR-11, FR-12, FR-13, FR-16
  test('a change that cannot be made says why and keeps the session', async ({ page }) => {
    await signInAsAdmin(page);
    await goTo(page, 'Change Password', 'Change Password');
    const fill = async (current: string, next: string, confirmation: string) => {
      await page.getByLabel('Current Password', { exact: true }).fill(current);
      await page.getByLabel('New Password', { exact: true }).fill(next);
      await page.getByLabel('Confirm New Password').fill(confirmation);
      await page.getByRole('button', { name: 'Change Password' }).click();
    };
    const fresh = randomUUID();

    await fill('not-my-password', fresh, fresh);
    await expect(page.getByRole('alert')).toHaveText('Current password is incorrect');

    await fill(adminPassword(), 'too short', 'too short');
    await expect(page.getByText(/10 and 64 characters/).last()).toBeVisible();

    await fill(adminPassword(), fresh, `${fresh}-typo`);
    await expect(page.getByText('The passwords do not match.')).toBeVisible();

    await fill(adminPassword(), adminPassword(), adminPassword());
    await expect(page.getByRole('alert')).toHaveText('New password must be different from current password');

    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  });

  // @trace FR-14, FR-15
  test('a new password ends every session of the administrator, in every browser', async ({ page, browser }) => {
    const elsewhere = await browser.newContext();
    const other = await elsewhere.newPage();
    await other.goto('/login');
    await other.getByLabel('Username').fill(adminUsername);
    await other.getByLabel('Password', { exact: true }).fill(adminPassword());
    await other.getByRole('button', { name: 'Sign In' }).click();
    await expect(other.getByRole('heading', { name: 'Inventory Overview' })).toBeVisible();

    await signInAsAdmin(page);
    await goTo(page, 'Change Password', 'Change Password');
    const fresh = randomUUID();
    await page.getByLabel('Current Password', { exact: true }).fill(adminPassword());
    await page.getByLabel('New Password', { exact: true }).fill(fresh);
    await page.getByLabel('Confirm New Password').fill(fresh);
    await page.getByRole('button', { name: 'Change Password' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Password changed successfully. Sign in with your new password.')).toBeVisible();

    // The other browser still shows the application until it asks the server for anything.
    await other.getByRole('link', { name: 'Products', exact: true }).click();
    await expect(other).toHaveURL(/\/login/);
    await elsewhere.close();

    await signIn(page, { username: adminUsername, password: adminPassword() });
    await expect(page.getByRole('alert')).toHaveText('Invalid username or password');
    await signIn(page, { username: adminUsername, password: fresh });
    await expect(page.getByRole('heading', { name: 'Inventory Overview' })).toBeVisible();
  });
});
