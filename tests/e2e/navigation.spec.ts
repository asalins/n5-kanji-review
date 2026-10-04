import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectTouchTarget, openHome } from './helpers';

test.skip(({ viewport }) => viewport?.width !== 360, 'browser history is checked once, on the 360 px phone');

const atHome = (page: Page) => expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
const appEntries = (page: Page) => page.evaluate(() => window.history.length);

test('system Back from every screen returns to Home inside the app (Simple Home boundary)', async ({ page }) => {
  await openHome(page);
  const base = await appEntries(page);
  for (const button of [/Today's review/, /Search/, /Settings/]) {
    await page.getByRole('button', { name: button }).tap();
    expect(await appEntries(page)).toBe(base + 1);
    await page.goBack();
    await atHome(page);
    expect(page.url()).toMatch(/\/$/);
  }
  // Home -> Settings -> About -> Back -> Home (About replaced the Settings entry)
  await page.getByRole('button', { name: /Settings/ }).tap();
  await page.getByRole('button', { name: /Sources & licences/ }).tap();
  await expect(page.getByRole('heading', { name: /About & Sources/ })).toBeVisible();
  expect(await appEntries(page)).toBe(base + 1);
  await page.goBack();
  await atHome(page);
});

test('going in and out many times does not pile up history', async ({ page }) => {
  await openHome(page);
  const base = await appEntries(page);
  for (let i = 0; i < 5; i += 1) {
    await page.getByRole('button', { name: /Search/ }).tap();
    await page.goBack();
    await atHome(page);
    await page.getByRole('button', { name: /Settings/ }).tap();
    await page.getByRole('button', { name: /Back/ }).tap(); // in-app Back
    await atHome(page);
  }
  expect(await appEntries(page)).toBeLessThanOrEqual(base + 1);
});

test('Back in the middle of a review keeps every rated card', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: /Today's review/ }).tap();
  await page.getByRole('button', { name: /Start/ }).tap();
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: /Show answer/ }).tap();
    await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: /Good/ }).tap();
    await expect(page.getByText(`Card ${i + 2} of`)).toBeVisible();
  }
  await page.goBack();
  await atHome(page);
  await expect(page.locator('dt', { hasText: /Reviews today/ }).locator('xpath=..')).toContainText('2');
});

test('About & Sources: reachable from Settings, licence acknowledgement and links, fits the phone, works offline', async ({ page, context }) => {
  await openHome(page);
  await page.getByRole('button', { name: /Settings/ }).tap();
  await expectTouchTarget(page.getByRole('button', { name: /Sources & licences/ }));
  await page.getByRole('button', { name: /Sources & licences/ }).tap();
  await expect(page.getByText(/KANJIDIC2/).first()).toBeVisible();
  await expect(page.getByText(/CC BY-SA 4\.0/).first()).toBeVisible();
  await expect(page.getByTestId('dataset-version')).toHaveText('n5-2026.10.01');
  await expect(page.getByRole('link', { name: /EDRDG licence statement/ })).toHaveAttribute('href', 'https://www.edrdg.org/edrdg/license.html');
  await expectNoHorizontalOverflow(page);
  await expectTouchTarget(page.getByRole('button', { name: /← ตั้งค่า/ }));
  // offline: the acknowledgement text is part of the app shell
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /Settings/ }).tap();
  await page.getByRole('button', { name: /Sources & licences/ }).tap();
  await expect(page.getByText(/KANJIDIC2/).first()).toBeVisible();
  await context.setOffline(false);
});
