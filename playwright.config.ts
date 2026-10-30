import { defineConfig, devices } from '@playwright/test';
import { runSettings, serverEnvironment } from './e2e/support/run-settings.mjs';

// The browser tests run against the executable JAR (`mvn -B -ntp verify` builds it, Angular included): where it listens,
// its throwaway database and the run's administrator password come from e2e/support/run-settings.mjs.
const settings = runSettings();
const { baseURL, command } = settings;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  // One server and one database: the specs share state, so they run one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: serverEnvironment(settings) as Record<string, string>,
  },
});
