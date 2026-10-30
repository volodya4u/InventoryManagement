import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signInAsAdmin } from './support/auth';
import { goTo } from './support/ui';

const EXPIRY_KEY = 'flower-shop.session-expiry';

// Ends the server's session behind the page's back, with the page's own cookies, as a sign-out in another browser would.
async function endSessionOnServer(context: BrowserContext) {
  const token = (await context.cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  const response = await context.request.post('/api/auth/logout', { headers: { 'X-XSRF-TOKEN': token } });
  expect(response.status()).toBe(204);
}

const apiCalls = (page: Page) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return calls;
};

test.describe('session', () => {
  // @trace FR-24
  test('an idle page returns to sign-in when the server timeout has passed, without asking the server', async ({ page }) => {
    await page.clock.install();
    await signInAsAdmin(page);
    const calls = apiCalls(page);

    // The server allows 8 hours of inactivity; the page learned that from the response headers.
    await page.clock.fastForward('08:00:30');

    await expect(page).toHaveURL(/\/login\?sessionExpired=true$/);
    await expect(page.getByText('Your session has ended. Please sign in again.')).toBeVisible();
    expect(calls.filter((call) => call.startsWith('GET'))).toEqual([]);
  });

  // @trace FR-25, FR-31
  test('signing out in one tab ends the session in the other, and activity renews the shared deadline', async ({ page, context }) => {
    await signInAsAdmin(page);
    const other = await context.newPage();
    await other.goto('/dashboard');
    await expect(other.getByRole('heading', { name: 'Inventory Overview' })).toBeVisible();

    const before = Number(await page.evaluate((key) => localStorage.getItem(key), EXPIRY_KEY));
    await page.waitForTimeout(1100);
    await goTo(page, 'Raw Materials', 'Raw Materials');
    const after = Number(await other.evaluate((key) => localStorage.getItem(key), EXPIRY_KEY));
    expect(after).toBeGreaterThan(before);

    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(other).toHaveURL(/\/login/);
    await expect(other.getByRole('heading', { name: 'Administrator Sign In' })).toBeVisible();
  });

  // @trace FR-31
  test('a tab that was suspended past the deadline is signed out when it comes back', async ({ page, context }) => {
    await signInAsAdmin(page);
    const suspended = await context.newPage();
    await suspended.goto('/dashboard');
    await expect(suspended.getByRole('heading', { name: 'Inventory Overview' })).toBeVisible();

    // While the tab slept, the shared deadline passed; waking it fires the focus event.
    await suspended.evaluate((key) => {
      localStorage.setItem(key, String(Date.now() - 1000));
      window.dispatchEvent(new Event('focus'));
    }, EXPIRY_KEY);

    await expect(suspended).toHaveURL(/\/login/);
  });

  // @trace FR-26, FR-30
  test('a refused request ends the session at once, but a server error or a lost connection does not', async ({ page }) => {
    await signInAsAdmin(page);

    await page.route('**/api/dashboard', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'The server is unwell.' }) }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('The server is unwell.');
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.unroute('**/api/dashboard');
    await page.route('**/api/dashboard', (route) => route.abort('connectionrefused'));
    await page.reload();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.unroute('**/api/dashboard');
    await page.route('**/api/dashboard', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Authentication required' }) }),
    );
    await page.reload();
    await expect(page).toHaveURL(/\/login\?sessionExpired=true$/);
    await expect(page.getByText('Your session has ended. Please sign in again.')).toBeVisible();
  });

  // @trace FR-28
  test('moving to another page checks the session again and goes to sign-in when it is gone', async ({ page, context }) => {
    await signInAsAdmin(page);
    await endSessionOnServer(context);

    await page.getByRole('link', { name: 'Products', exact: true }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Administrator Sign In' })).toBeVisible();
  });

  // @trace FR-27
  test('a write is held back and the person signed out when the server no longer knows the session', async ({ page, context }) => {
    await signInAsAdmin(page);
    await goTo(page, 'Raw Materials', 'Raw Materials');
    await page.getByRole('button', { name: '+ Add Raw Material' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Raw Material' });
    await dialog.getByLabel('Name *').fill('Never saved');
    await endSessionOnServer(context);

    const writes = apiCalls(page);
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(/\/login\?sessionExpired=true$/);
    expect(writes.filter((call) => call === 'POST /api/raw-materials')).toEqual([]);
  });

  // @trace FR-29
  test('a refused write that is not a lost session keeps the person signed in', async ({ page }) => {
    await signInAsAdmin(page);
    await goTo(page, 'Raw Materials', 'Raw Materials');
    await page.route('**/api/raw-materials', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Access denied' }) })
        : route.continue(),
    );
    await page.getByRole('button', { name: '+ Add Raw Material' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Raw Material' });
    await dialog.getByLabel('Name *').fill('Refused');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/raw-materials$/);
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  });
});
