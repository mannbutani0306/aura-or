import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts',
  testMatch: ['screenshots.ts', 'qa.ts'],
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/api/pulse',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});