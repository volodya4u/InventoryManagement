import { expect, type Locator, type Page } from '@playwright/test';

// The row of a list page (Raw Materials, Products) whose bold name is exactly `name`. A row's accessible name starts with
// its photo cell, so rows are found by the name cell instead.
export function nameRow(page: Page, name: string): Locator {
  return page.locator('tbody tr').filter({ has: page.locator('td > strong').getByText(name, { exact: true }) });
}

// Opens a page from the main navigation, as a person does, and waits for its heading.
export async function goTo(page: Page, link: string, heading: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: link, exact: true }).click();
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
}
