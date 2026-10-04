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

export default defineConfig({
  testDir: 'tests/e2e',
  // The production build is served: the service worker and offline mode only exist there.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    // Mobile-first targets: small, common and large Android phones (portrait).
    { name: 'phone-320', use: phone(320, 640) },
    { name: 'phone-360', use: phone(360, 800) },
    { name: 'phone-412', use: phone(412, 915) },
  ],
});
