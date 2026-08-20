import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

test.skip(process.env.UPDATE_README_SCREENSHOTS !== '1', 'Run with UPDATE_README_SCREENSHOTS=1 to refresh tracked documentation images.');

const shot = { animations: 'disabled' as const, caret: 'hide' as const };

async function openLauncher(page: Page) {
  await page.locator('.launcher-button').evaluate((element) => (element as HTMLButtonElement).click());
  await page.locator('.launcher input[placeholder="Search apps"]').waitFor();
}

async function closeWindows(page: Page) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const close = page.locator('.window:not(.window-closing) .close-control');
    if (await close.count() === 0) return;
    await close.last().evaluate((element) => (element as HTMLButtonElement).click());
    await page.waitForTimeout(260);
  }
  throw new Error('Could not close all persisted windows before capturing screenshots.');
}

async function openApp(page: Page, name: string) {
  await openLauncher(page);
  await page.locator('.launcher input[placeholder="Search apps"]').fill(name);
  await page.locator('.launcher .app-tile').filter({ has: page.locator('span', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).click({ force: true });
}

function snapshotName(name: string) {
  return name.toLowerCase().replace(/押韵大师promax/, 'promax').replace(/command & conquer: red alert 3/, 'red-alert-3').replace(/3d pinball: space cadet/, '3d-pinball-space-cadet').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function captureApp(page: Page, name: string) {
  await page.goto('/');
  await page.waitForSelector('.os');
  await closeWindows(page);
  await openApp(page, name);
  const window = page.locator('.window.focused').last();
  await window.waitFor({ state: 'visible' });
  await page.waitForTimeout(700);
  const box = await window.boundingBox();
  if (!box || box.width < 300 || box.height < 220) throw new Error(`Could not locate a usable ${name} window: ${JSON.stringify(box)}`);
  await window.screenshot({ path: `../../docs/screenshots/apps/${snapshotName(name)}.png`, ...shot });
}

async function captureDota2Match(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.os');
  await closeWindows(page);
  await openApp(page, 'DOTA2');
  const frame = page.frameLocator('iframe[title="DOTA2"]');
  await frame.getByRole('button', { name: 'Start game' }).first().click();
  await expect(frame.getByLabel('DOTA2 skirmish match')).toBeVisible();
  await expect(frame.getByLabel('Playable 3D battlefield')).toBeVisible();
  // Capture the OS window, not the responsive iframe viewport. This keeps the
  // product-tour asset at the same 760×500 dimensions as the app gallery and
  // includes the real window frame around the playable match.
  const window = page.locator('.window.focused').filter({ has: page.locator('iframe[title="DOTA2"]') }).last();
  await expect(window).toBeVisible();
  await window.screenshot({ path: '../../docs/screenshots/dota2.png', ...shot });
}

test('capture README product screenshots', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.waitForSelector('.os');
  await closeWindows(page);
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

test('capture README serious-software screenshot', async ({ page }) => {
  test.setTimeout(60_000);
  await captureDota2Match(page);
});

test('capture README app gallery snapshots', async ({ page }) => {
  test.setTimeout(300_000);
  const apps = [
    'Assistant', 'App Shop', 'Settings', 'Browser', 'Firefox', 'Sublime Text', 'Zed', 'Codex', 'Claude Code',
    'Paint', 'Paint3d', 'CAD Editor', '3d Model Editor', 'Draw.Io', 'Midi editor', 'Music Studio', 'Poetry House',
    'Scientific Calculator', 'Minesweeper', 'FreeCell', 'Tetris', 'DOTA2', 'Command & Conquer: Red Alert 3',
    'Warcraft III', 'CS1.6', 'Flappy Bird', 'Temple Run', '3D Pinball: Space Cadet', 'Android Simulator',
    'Iphone Simulator', 'Excel', 'Word', 'Powerpoint', 'Outlook', 'Plants Vs Zombies', '押韵大师ProMax'
  ];
  for (const name of apps) await captureApp(page, name);
});
