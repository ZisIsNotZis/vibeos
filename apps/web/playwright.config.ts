import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 20_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'VIBEOS_STATE_FILE=/tmp/vibeos-playwright-state.json VIBEOS_AGENT_MODE=deterministic VIBEOS_PORT=8787 node ../server/dist/index.js', url: 'http://127.0.0.1:8787/health', reuseExistingServer: true, timeout: 30_000 },
    { command: 'npm run dev --workspace @vibeos/web -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 30_000 }
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
