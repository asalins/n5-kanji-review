import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    // Mobile-first target: Android Chrome
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
});
