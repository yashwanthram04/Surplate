import { defineConfig, devices } from '@playwright/test';

// E2E tests run against a throwaway stack: the API on :3100 with its own in-memory,
// freshly seeded MongoDB (no .env needed, nothing shared is touched) plus the Vite dev
// server on :5273 proxying to it.
const API_PORT = 3100;
const WEB_PORT = 5273;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tests share one database; unique data per test keeps them independent
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm --prefix server start',
      url: `http://localhost:${API_PORT}/api/stats`,
      env: { PORT: String(API_PORT), MONGODB_URI: '' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm --prefix client run dev',
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_PORT: String(WEB_PORT), VITE_API_PROXY: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
