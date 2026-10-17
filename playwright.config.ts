import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Optional Chromium binary for environments where Playwright cannot download its own browser.
 * Test infrastructure only (not a project dependency): set PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const phone = (width: number, height: number) => ({
  ...devices['Pixel 7'],
  viewport: { width, height },
  launchOptions: executablePath ? { executablePath } : {},
});

const desktop = (width: number, height: number) => ({
  ...devices['Desktop Chrome'],
  viewport: { width, height },
  launchOptions: executablePath ? { executablePath } : {},
});

export default defineConfig({
  testDir: 'tests/e2e',
  // The production build is served: the service worker and offline mode only exist there.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    // L2: a FAKE Firebase config, so the optional account section exists in the E2E build. It points at an
    // unresolvable domain and the specs block every Google/Firebase request: no real sign-in ever happens in E2E.
    env: {
      VITE_FIREBASE_API_KEY: 'e2e-fake-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'e2e-auth.invalid',
      VITE_FIREBASE_PROJECT_ID: 'e2e-project',
      VITE_FIREBASE_APP_ID: '1:0:web:e2e',
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    // Mobile-first targets: small, common and large Android phones (portrait). All specs except the smoke spec.
    { name: 'phone-320', use: phone(320, 640), testIgnore: /smoke\.spec\.ts/ },
    { name: 'phone-360', use: phone(360, 800), testIgnore: /smoke\.spec\.ts/ },
    { name: 'phone-412', use: phone(412, 915), testIgnore: /smoke\.spec\.ts/ },
    // Desktop and landscape: smoke tests only (the phone projects carry the full suite).
    { name: 'desktop-1024', use: desktop(1024, 768), testMatch: /smoke\.spec\.ts/ },
    { name: 'desktop-1440', use: desktop(1440, 900), testMatch: /smoke\.spec\.ts/ },
    { name: 'landscape-812', use: phone(812, 360), testMatch: /smoke\.spec\.ts/ },
    { name: 'landscape-915', use: phone(915, 412), testMatch: /smoke\.spec\.ts/ },
  ],
});
