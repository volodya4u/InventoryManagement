import { expect, test, type Page } from '@playwright/test';
import { signInAsAdmin } from './support/auth';

// A request made by the page itself, with its cookies, as a script injected into a page would make it.
const call = (page: Page, method: string, path: string, headers: Record<string, string> = {}) =>
  page.evaluate(
    async ([m, p, h]) => {
      const response = await fetch(p, { method: m, headers: h as Record<string, string>, credentials: 'same-origin' });
      const text = await response.text();
      return { status: response.status, text, timeout: response.headers.get('x-session-timeout-seconds') };
    },
    [method, path, headers] as const,
  );

const csrfToken = (page: Page) => page.evaluate(() => document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.slice(11) ?? '');

test.describe('security', () => {
  // @trace FR-4, FR-7, FR-36
  test('signed out, the data and the pages are out of reach; only the health check answers', async ({ page, context }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Administrator Sign In' })).toBeVisible();

    // The health check is public and starts no session.
    await context.clearCookies();
    const health = await call(page, 'GET', '/api/health');
    expect(health.status).toBe(200);
    expect(health.timeout).toBeNull();
    expect(JSON.parse(health.text)).toEqual({ status: 'UP' });
    expect((await context.cookies()).filter((cookie) => cookie.name === 'JSESSIONID')).toEqual([]);

    const me = await call(page, 'GET', '/api/auth/me');
    expect(me.status).toBe(401);
    const raw = await call(page, 'GET', '/api/raw-materials');
    expect(raw.status).toBe(401);
    expect(JSON.parse(raw.text)).toEqual({ message: 'Authentication required' });
  });

  // @trace FR-5, FR-6, FR-8, FR-23
  test('a write needs the token the server issued, and the server ends the session on sign-out', async ({ page }) => {
    await signInAsAdmin(page);

    // The session timeout travels with every response, so the page can follow it.
    const dashboard = await call(page, 'GET', '/api/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.timeout).toBe('28800');

    // The token is in a cookie the page can read, and a write without it echoed in the header is refused.
    const token = await csrfToken(page);
    expect(token).not.toBe('');
    expect((await call(page, 'POST', '/api/auth/logout')).status).toBe(403);
    expect((await call(page, 'GET', '/api/auth/me')).status).toBe(200);

    expect((await call(page, 'POST', '/api/auth/logout', { 'X-XSRF-TOKEN': token })).status).toBe(204);
    expect((await call(page, 'GET', '/api/auth/me')).status).toBe(401);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  });
});
