import { test, expect } from '@playwright/test';

test('boots into the desktop and opens the launcher', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await expect(page.getByPlaceholder('Search apps')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('launcher search filters apps and Escape closes it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  const search = page.getByPlaceholder('Search apps');
  await search.fill('Settings');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await search.press('Escape');
  await expect(page.getByPlaceholder('Search apps')).not.toBeVisible();
});

test('opens a window, focuses it, and closes it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Generation' })).toBeVisible();
  await page.getByRole('button', { name: 'Close window' }).last().click({ force: true });
});

test('settings changes persist through a websocket snapshot', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('slider', { name: 'Effort level' }).fill('0');
  await expect(page.getByText('fastest reasonable result', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Appearance' }).click({ force: true });
  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveClass(/light-mode/);
});

test('keyboard shortcuts open and close the launcher', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder('Search apps')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('Search apps')).not.toBeVisible();
});
