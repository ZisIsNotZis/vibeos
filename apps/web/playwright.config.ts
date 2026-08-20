import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: [
    {
      command: 'node scripts/start-e2e-server.mjs',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev --workspace @vibeos/web -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
    },
  ],
});
