import { test, expect } from '@playwright/test';
async function openLauncherApp(page: import('@playwright/test').Page, name: string) { await page.locator('.launcher-button').evaluate((element) => (element as HTMLButtonElement).click()); const search = page.getByPlaceholder('Search apps'); await search.waitFor(); await search.fill(name); await page.locator('.launcher .app-tile').filter({ hasText: name }).click({ force: true }); }
test('opens App Shop and installs a visible placeholder app', async ({ page }) => { const name = `Tetris ${Date.now()}`; await page.goto('/'); await openLauncherApp(page, 'App Shop'); const shop = page.getByRole('article').filter({ hasText: 'App Shop' }).last(); await expect(shop.getByRole('heading', { name: 'App Shop' })).toBeVisible(); await shop.getByLabel('Search apps').fill(name); await shop.getByRole('button', { name: 'Imagine and install' }).click(); await expect(shop.getByText(`${name} · placeholder`)).toBeVisible(); });
test('opens Settings and changes both execution sliders', async ({ page }) => { await page.goto('/'); await openLauncherApp(page, 'Settings'); const settings = page.getByRole('article').filter({ hasText: 'Generation' }).last(); await expect(settings.getByRole('heading', { name: 'Generation' })).toBeVisible(); await settings.getByLabel('Effort level').fill('4'); await expect(settings.locator('.settings-panel strong').first()).toHaveText('research'); await settings.getByLabel('Search level').fill('1'); await expect(settings.locator('.settings-panel strong').nth(1)).toHaveText('online info'); });
test('settings has an appearance tab with theme, image, and background controls', async ({ page }) => { await page.goto('/'); await openLauncherApp(page, 'Settings'); const settings = page.getByRole('article').filter({ hasText: 'Generation' }).last(); await settings.getByRole('button', { name: 'Appearance' }).click(); await expect(settings.getByRole('heading', { name: 'Appearance' })).toBeVisible(); await settings.getByRole('button', { name: 'Light' }).click(); await expect(page.locator('html')).toHaveClass(/light-mode/); await settings.getByLabel('Background mode').selectOption('pad'); await expect(settings.getByLabel('Background mode')).toHaveValue('pad'); });
test('appearance controls change dock position and maximize chrome behavior', async ({ page }) => { await page.goto('/'); await openLauncherApp(page, 'Settings'); const settings = page.getByRole('article').filter({ hasText: 'Generation' }).last(); await settings.getByRole('button', { name: 'Appearance' }).click(); await settings.getByLabel('Auto-hide system bars when maximized').check(); await settings.getByRole('button', { name: 'Left' }).click(); await expect(page.locator('.os')).toHaveAttribute('data-dock-position', 'left'); });
test('Firefox address navigation opens cached Google and Baidu pages in the same app', async ({ page }) => {
  await page.goto('/');
  await openLauncherApp(page, 'Firefox');
  const firefox = page.getByRole('article').filter({ hasText: 'Firefox' }).last();
  const address = firefox.getByLabel('Search or enter address');
  await address.fill('google.com');
  await address.press('Enter');
  await expect(firefox.locator('.surface-copy')).toContainText('Google');
  await address.fill('baidu.com');
  await address.press('Enter');
  await expect(firefox.locator('.surface-copy')).toContainText('百度一下');
});
test('Browser address navigation reuses cached Google and Baidu surfaces', async ({ page }) => {
  await page.goto('/');
  await openLauncherApp(page, 'Browser');
  const browser = page.getByRole('article').filter({ hasText: 'Browser' }).last();
  const address = browser.locator('.address');
  await address.fill('google.com');
  await address.press('Enter');
  await expect(browser).toContainText('Google');
  await address.fill('baidu.com');
  await address.press('Enter');
  await expect(browser).toContainText('百度一下');
});
