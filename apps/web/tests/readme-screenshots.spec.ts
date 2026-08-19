import { test } from '@playwright/test';
import type { Page } from '@playwright/test';

const shot = { animations: 'disabled' as const, caret: 'hide' as const };

async function openLauncher(page: Page) {
  await page.locator('.launcher-button').evaluate((element) => (element as HTMLButtonElement).click());
  await page.getByPlaceholder('Search apps').waitFor();
}

async function openApp(page: Page, name: string) {
  await openLauncher(page);
  await page.getByPlaceholder('Search apps').fill(name);
  await page.getByRole('button', { name, exact: true }).click({ force: true });
}

test('capture README product screenshots', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.os');
  await page.screenshot({ path: '../../docs/screenshots/desktop.png', fullPage: true, ...shot });

  await openLauncher(page);
  await page.screenshot({ path: '../../docs/screenshots/launcher.png', fullPage: true, ...shot });
  await page.keyboard.press('Escape');

  await openApp(page, 'Settings');
  const settings = page.getByRole('article').filter({ hasText: 'Generation' }).last();
  await settings.getByRole('button', { name: 'Appearance' }).click();
  await page.screenshot({ path: '../../docs/screenshots/settings-appearance.png', fullPage: true, ...shot });

  await openApp(page, 'Browser');
  await page.screenshot({ path: '../../docs/screenshots/browser.png', fullPage: true, ...shot });
});
