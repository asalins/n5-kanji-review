import { expect, test, type Page, type Request } from '@playwright/test';
import { openHome } from './helpers';
import { readDatabase } from './idb';

// L0 Login Spike (branch login-spike only). Checked once, on the 360 px phone.
test.skip(({ viewport }) => viewport?.width !== 360, 'spike isolation is checked once, on the 360 px phone');

const FIREBASE_OR_SPIKE = /loginSpike-|firebase|googleapis|gstatic|identitytoolkit|securetoken/;

function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.context().on('request', (r: Request) => urls.push(r.url()));
  return urls;
}

test('T8: Home and Settings load no Firebase SDK; it loads only when the spike page is opened', async ({ page }) => {
  const urls = recordRequests(page);
  await openHome(page);
  await page.reload(); // second load, now under the service worker
  await openHome(page);
  await page.getByRole('button', { name: /Settings/ }).tap();
  await expect(page.getByTestId('login-spike-link')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(urls.filter((u) => FIREBASE_OR_SPIKE.test(u)), 'Home + Settings, before the spike is opened').toEqual([]);

  await page.getByTestId('login-spike-link').tap();
  await expect(page.getByRole('heading', { name: /L0 Login Spike/ })).toBeVisible();
  expect(urls.some((u) => /\/assets\/loginSpike-[^/]+\.js$/.test(u)), 'spike chunk requested on the spike page').toBe(true);
  // Built without VITE_FIREBASE_* here: the page must say so instead of failing silently.
  await expect(page.locator('#log')).toContainText('CONFIG MISSING');
});

test('returning from the spike leaves the app data and progress unchanged; signed-out users still study', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: /Today's review/ }).tap();
  await page.getByRole('button', { name: /Start/ }).tap();
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: /Show answer/ }).tap();
    await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: /Good/ }).tap();
    await expect(page.getByText(`Card ${i + 2} of`)).toBeVisible();
  }
  await page.goBack();
  await openHome(page);
  const before = await readDatabase(page);

  await page.getByRole('button', { name: /Settings/ }).tap();
  await page.getByTestId('login-spike-link').tap();
  await expect(page.getByRole('heading', { name: /L0 Login Spike/ })).toBeVisible();
  await page.getByRole('link', { name: /กลับแอปหลัก/ }).tap();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();

  expect(await readDatabase(page)).toEqual(before);
  await expect(page.locator('dt', { hasText: /Reviews today/ }).locator('xpath=..')).toContainText('2');
});

test('under the service worker, /login-spike is the spike page, not the app shell', async ({ page }) => {
  await openHome(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await openHome(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.goto('/login-spike');
  await expect(page.getByRole('heading', { name: /L0 Login Spike/ })).toBeVisible();
});
