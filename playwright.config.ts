import { defineConfig, devices } from '@playwright/test';
import { projectServers, runSettings, serverEnvironment } from './e2e/support/run-settings.mjs';

// The browser tests run against the executable JAR (`mvn -B -ntp verify` builds it, Angular included): where it listens,
// its throwaway database and the run's administrator password come from e2e/support/run-settings.mjs. Each browser has
// its own server and database, so the specs can create data by name in every browser.
//
// E2E_RECORD=1 (pnpm run record:demos) is the recording run: Chromium only, video and a still for every test, no retries,
// and e2e/support/recording-reporter.mjs writes docs/qa/demo-recordings/. E2E_BROWSERS=chromium runs one browser.
const recording = !!process.env.E2E_RECORD;
if (recording) process.env.E2E_BROWSERS = 'chromium';
const settings = runSettings();
const servers = projectServers(settings);
const viewport = { width: 1280, height: 720 };

const devicesByProject = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  // The specs of one browser share a server and a database, so they run one after another.
  fullyParallel: false,
  workers: 1,
  // Some flows open two browsers, and a recording run pauses after every action.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI && !recording ? 1 : 0,
  reporter: recording
    ? [['list'], ['./e2e/support/recording-reporter.mjs']]
    : process.env.CI
      ? [['list'], ['html', { open: 'never' }]]
      : [['list']],
  use: {
    trace: recording ? 'off' : 'retain-on-failure',
    ...(recording
      ? {
          video: { mode: 'on', size: { width: 960, height: 540 } },
          screenshot: { mode: 'on', fullPage: true },
          // A pause after every action, so a person watching a clip can follow it.
          launchOptions: { slowMo: 200 },
        }
      : {}),
  },
  projects: servers.map((server) => ({
    name: server.name,
    use: {
      ...devicesByProject[server.name as keyof typeof devicesByProject],
      baseURL: server.baseURL,
      ...(recording ? { viewport } : {}),
    },
  })),
  webServer: servers.map((server) => ({
    name: server.name,
    command: server.command,
    url: `${server.baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: serverEnvironment(settings) as Record<string, string>,
  })),
});
