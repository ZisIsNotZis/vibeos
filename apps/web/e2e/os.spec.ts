import { test, expect } from '@playwright/test';

test('boots into the desktop and opens the launcher', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await expect(page.locator('.launcher input[placeholder="Search apps"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('launcher search filters apps and Escape closes it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  const search = page.locator('.launcher input[placeholder="Search apps"]');
  await search.fill('Settings');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await search.press('Escape');
  await expect(page.locator('.launcher input[placeholder="Search apps"]')).not.toBeVisible();
});

test('opens a window, focuses it, and closes it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Generation', exact: true })).toBeVisible();
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
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('combobox', { name: 'Interface font' }).selectOption('accessible');
  await page.getByRole('combobox', { name: 'Code font' }).selectOption('system');
  await page.getByRole('combobox', { name: 'Display scale' }).selectOption('large');
  await expect(page.locator('html')).toHaveAttribute('data-ui-typeface', 'accessible');
  await expect(page.locator('html')).toHaveAttribute('data-mono-typeface', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-display-scale', 'large');
  await expect(page.locator('html')).toHaveCSS('--type-scale', '1.25');
  await page.getByRole('combobox', { name: 'Background mode' }).selectOption('fill');
  await expect(page.locator('.os')).toHaveAttribute('data-background-mode', 'fill');
});

test('generation access controls are independent and keep the legacy search preset visible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Generation access' })).toBeVisible();
  await page.getByLabel('Knowledge generation access').selectOption('recommended');
  await page.getByLabel('Assets generation access').selectOption('allowed');
  await page.getByLabel('Code generation access').selectOption('off');
  await page.getByLabel('Packages generation access').selectOption('recommended');
  await expect(page.getByLabel('Knowledge generation access')).toHaveValue('recommended');
  await expect(page.getByLabel('Assets generation access')).toHaveValue('allowed');
  await expect(page.getByLabel('Code generation access')).toHaveValue('off');
  await expect(page.getByLabel('Packages generation access')).toHaveValue('recommended');
  await expect(page.getByRole('heading', { name: 'Legacy Search level' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Search level' })).toBeVisible();
});

test('generation settings explain effort levels and deferred capability reachability', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Effort guide' })).toBeVisible();
  const guide = page.locator('#effort-guide-heading').locator('..');
  await expect(guide).toContainText('fast');
  await expect(guide).toContainText('balanced');
  await expect(guide).toContainText('quality');
  await expect(guide).toContainText('ultra');
  await expect(page.getByRole('heading', { name: 'Deferred capabilities stay reachable' })).toBeVisible();
  await expect(page.getByText('never a dead button', { exact: false })).toBeVisible();
});

test('model prefix is separate from the model slider', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.range-labels').first()).toContainText('gpt-5.6-');
  await expect(page.locator('.range-labels').first()).not.toContainText('gh/');
  const prefix = page.getByLabel('Use gh model prefix');
  const initial = await prefix.isChecked();
  await prefix.click();
  await expect(prefix).toBeChecked({ checked: !initial });
  await prefix.click();
  await expect(prefix).toBeChecked({ checked: initial });
});

test('global command palette opens over a generated app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  const sublime = page.getByRole('button', { name: 'Sublime Text', exact: true });
  if (await sublime.count()) {
    await sublime.click();
    await expect(page.frameLocator('iframe[title="Sublime Text"]').getByLabel('Code editor')).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.getByLabel('Command palette')).toBeVisible();
    await page.getByLabel('Command palette').fill('transform the selected text');
    await page.getByLabel('Command palette').press('Enter');
    await expect(page.getByLabel('Command palette')).not.toBeVisible();
  }
});

test('DOTA2 lobby enters a three-lane playable match with combat and HUD', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  const dota = page.getByRole('button', { name: 'DOTA2', exact: true });
  await dota.click();
  const frame = page.frameLocator('iframe[title="DOTA2"]');
  await expect(frame.getByRole('button', { name: 'Start game' }).first()).toBeVisible();
  await frame.locator('#start-game').click();
  await expect(frame.getByLabel('DOTA2 skirmish match')).toBeVisible();
  await expect(frame.getByLabel('Playable 3D battlefield')).toBeVisible();
  await expect(frame.getByText('Battle in progress')).toBeVisible();
  await expect(frame.locator('.lane-legend [aria-label="Top lane"]')).toBeVisible();
  await expect(frame.locator('.lane-legend [aria-label="Middle lane"]')).toBeVisible();
  await expect(frame.locator('.lane-legend [aria-label="Bottom lane"]')).toBeVisible();
  await expect(frame.getByText('Radiant safe lane')).toBeVisible();
  await frame.getByRole('button', { name: 'Cast Arc Bolt' }).click();
  await expect(frame.locator('#game-message')).toContainText(/Arc Bolt (hit|fired)|no enemy was in range/i);
  await expect(frame.locator('#q-cooldown')).not.toHaveText('Ready');
  await expect(frame.getByText('Dire Invoker')).toBeVisible();
  await frame.locator('#leave-game').evaluate((element) => (element as HTMLButtonElement).click());
  await expect(frame.getByText('Start game').first()).toBeVisible();
});

test('keyboard shortcuts open and close global overlays', async ({ page }) => {
  await page.goto('/');
  await page.locator('.topbar').click();
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('Command palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Command palette')).not.toBeVisible();
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.locator('.launcher input[placeholder="Search apps"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.launcher input[placeholder="Search apps"]')).not.toBeVisible();
});

test('desktop command palette submits a world-scoped command', async ({ page }) => {
  await page.goto('/');
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const close = page.locator('.window:not(.window-closing) .close-control');
    if (await close.count() === 0) break;
    await close.last().click({ force: true });
    await page.waitForTimeout(260);
  }
  await page.locator('.topbar').click();
  await page.keyboard.press('Control+k');
  const palette = page.getByLabel('Command palette');
  await expect(palette).toHaveAttribute('placeholder', 'Command the VibeOS desktop');
  await palette.fill('show me the desktop state');
  await palette.press('Enter');
  await expect(palette).not.toBeVisible();
});

test('core Chinese IME converts pinyin without a host IME', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  const search = page.locator('.launcher input[placeholder="Search apps"]');
  await search.focus();
  await page.keyboard.press('Control+Space');
  await expect(page.getByTitle('Chinese input on')).toBeVisible();
  await page.keyboard.type('nihao');
  const candidates = page.getByRole('listbox', { name: 'Chinese input candidates' });
  await expect(candidates).toBeVisible();
  await expect(candidates).toContainText('你好');
  await page.keyboard.press('Backspace');
  await expect(candidates).toContainText('你');
  await page.keyboard.type('o');
  await expect(candidates).toContainText('你好');
  await page.keyboard.press('Space');
  await expect(search).toHaveValue('你好');
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await expect(search).toHaveValue('你好abc');
});

test('Chinese IME works inside a generated app frame', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Sublime Text', exact: true }).click();
  const editor = page.frameLocator('iframe[title="Sublime Text"]').getByLabel('Code editor');
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.press('Control+Space');
  await expect(page.getByTitle('Chinese input on')).toBeVisible();
  await page.keyboard.type('nihao');
  await expect(page.getByRole('listbox', { name: 'Chinese input candidates' })).toContainText('你好');
  await editor.press('Space');
  await expect(editor).toHaveValue(/你好/);
});

test('generated apps can use the core context menu primitive', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Sublime Text', exact: true }).click();
  const file = page.frameLocator('iframe[title="Sublime Text"]').locator('.sidebar .file[data-file="app.js"]');
  await expect(file).toBeVisible();
  await file.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Rename…' })).toBeVisible();
});

test('Sublime creates a named file without browser dialogs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Sublime Text', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Sublime Text"]');
  await expect(frame.locator('#newFile')).toBeEnabled();
  await frame.locator('#newFile').click();
  const dialog = frame.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('background-color', /^(?!rgba\(0, 0, 0, 0\)$).+/);
  const name = frame.getByLabel('File name');
  await expect(name).toBeVisible();
  await name.fill('hello.py');
  await name.press('Enter');
  await expect(frame.locator('.sidebar .file[data-file="hello.py"]')).toBeVisible();
});

test('Sublime highlights Python, saves with Ctrl+S, and rejects invalid Python', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Sublime Text', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Sublime Text"]');
  const editor = frame.getByLabel('Code editor');
  await frame.locator('#newFile').click();
  const name = frame.getByLabel('File name');
  await name.fill('hello.py');
  await name.press('Enter');
  await expect(frame.locator('#language')).toHaveText('Python');
  await editor.fill('def broken()');
  await expect(frame.locator('#highlight strong')).toContainText('def');
  await editor.press('Control+s');
  await expect(frame.locator('#status')).toHaveText('Saved');
  await expect(frame.locator('.tab.active .dot')).toBeHidden();
  await frame.locator('#runBtn').click();
  await expect(frame.locator('#status')).toHaveText('Python syntax error');
  await editor.fill('def good():\n  pass');
  await frame.locator('#runBtn').click();
  await expect(frame.locator('#status')).toHaveText('Python checked successfully');
});

test('clicking an app frame raises its window', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Sublime Text', exact: true }).click();
  const sublimeWindow = page.locator('.window').filter({ has: page.locator('iframe[title="Sublime Text"]') });
  await expect(sublimeWindow).toHaveClass(/focused/);
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(sublimeWindow).not.toHaveClass(/focused/);
  await page.frameLocator('iframe[title="Sublime Text"]').getByLabel('Code editor').click();
  await expect(sublimeWindow).toHaveClass(/focused/);
});

test('Sublime renders fenced Markdown without inline-code treatment', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /open app launcher/i }).click();
  await page.getByRole('button', { name: 'Sublime Text', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Sublime Text"]');
  const editor = frame.getByLabel('Code editor');
  await frame.locator('.sidebar .file[data-file="README.md"]').click();
  await editor.fill('```py\ndef f(): pass\n```');
  await expect(frame.locator('#highlight .fence')).toHaveCount(2);
  await expect(frame.locator('#highlight')).toContainText('def f(): pass');
  await expect(frame.locator('#highlight code')).toHaveCount(0);
});

test('command palette has readable text in every shipped theme', async ({ page }) => {
  await page.goto('/');
  await page.locator('.topbar').click();
  await page.keyboard.press('Control+k');
  const input = page.getByLabel('Command palette');
  for (const theme of ['dark', 'light', 'desert'] as const) {
    await page.locator('html').evaluate((element, selectedTheme) => element.dataset.theme = selectedTheme, theme);
    const contrast = await input.evaluate(element => {
      const luminance = (color: string) => { const values = color.match(/\d+/g)!.slice(0, 3).map(Number).map(value => { const unit = value / 255; return unit <= .03928 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4; }); return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]; };
      const fg = luminance(getComputedStyle(element).color); const bg = luminance(getComputedStyle(element.parentElement!).backgroundColor); return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
    });
    expect(contrast).toBeGreaterThan(4.5);
  }
});
