import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const isCI = !!process.env.CI;
const WEB_PORT = Number(process.env.WEB_PORT ?? 3100);
const baseURL = `http://localhost:${WEB_PORT}`;

// Opt-in projects. They are never part of the default run.
const includeDrill = process.env.DRILL === '1';
const includeGenaiDrafts = !!process.env.GENAI_DRAFTS_DIR;

const reportDir = process.env.REPORT_DIR ?? 'reports';

const reporter: PlaywrightTestConfig['reporter'] = [
  [isCI ? 'github' : 'list'],
  ['html', { outputFolder: 'playwright-report', open: 'never' }],
  // Machine-readable results: consumed by tools/analyze-runs and kept as a CI artifact.
  ['json', { outputFile: `${reportDir}/results.json` }],
  ['junit', { outputFile: `${reportDir}/junit.xml` }],
];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter,
  use: {
    baseURL,
    testIdAttribute: 'data-testid',
    // Failure evidence: kept only for failed attempts so green runs stay small.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    { name: 'chromium', testDir: './tests/web', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testDir: './tests/web', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testDir: './tests/web', use: { ...devices['Desktop Safari'] } },
    // Electron is launched by the fixture in tests/desktop/fixtures.ts, not by a browser project.
    { name: 'desktop', testDir: './tests/desktop', timeout: 60_000 },
    ...(includeDrill ? [{ name: 'drill', testDir: './tests/drill', use: { ...devices['Desktop Chrome'] } }] : []),
    ...(includeGenaiDrafts
      ? [{ name: 'genai-drafts', testDir: process.env.GENAI_DRAFTS_DIR!, use: { ...devices['Desktop Chrome'] } }]
      : []),
  ],
  webServer: process.env.SKIP_WEB_SERVER
    ? undefined
    : {
        command: 'npx tsx apps/web/src/server.ts',
        url: `${baseURL}/api/health`,
        reuseExistingServer: !isCI,
        timeout: 60_000,
        env: { PORT: String(WEB_PORT), CART_LATENCY_MS: process.env.CART_LATENCY_MS ?? '0' },
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
