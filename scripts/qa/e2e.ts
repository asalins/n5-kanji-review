/**
 * E2E step of `npm run verify:all`. Never reports success without running the browser tests:
 * if no Chromium is available it prints "E2E BLOCKED" and exits with code 2.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
let bundled = '';
try {
  bundled = chromium.executablePath();
} catch {
  bundled = '';
}
const available = configured !== undefined && configured !== '' ? existsSync(configured) : bundled !== '' && existsSync(bundled);

if (!available) {
  console.error('E2E BLOCKED — Chromium unavailable (set PLAYWRIGHT_CHROMIUM_EXECUTABLE or run `npx playwright install chromium`).');
  process.exit(2);
}
const result = spawnSync('npx', ['playwright', 'test'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
