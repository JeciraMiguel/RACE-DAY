import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '5600';
const webPort = process.env.E2E_WEB_PORT ?? '5601';

// End-to-end tests drive the real app: the API (fresh SQLite database) and the Vite dev server.
export default defineConfig({
  testDir: './e2e',
  // The tests share one database and create their own users, so they run one after another
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Locally use the installed Google Chrome; CI installs Playwright's own Chromium
      use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' },
    },
  ],
  webServer: [
    {
      command: 'node e2e/start-api.mjs',
      url: `http://localhost:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: { E2E_API_PORT: apiPort },
    },
    {
      command: `npm run dev -- --port ${webPort} --strictPort`,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { SERVER_HTTP: `http://localhost:${apiPort}` },
    },
  ],
});
