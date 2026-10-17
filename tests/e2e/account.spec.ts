import { expect, test, type Page } from '@playwright/test';
import { openHome } from './helpers';
import { readDatabase } from './idb';

// L2 optional account. The E2E build has a FAKE Firebase config (playwright.config.ts); no real Google sign-in here.
test.skip(({ viewport }) => viewport?.width !== 360, 'the account is checked once, on the 360 px phone');

const EXTERNAL = /googleapis|gstatic|google\.com|firebaseapp|e2e-auth\.invalid|firebase\.google/;
const SDK_CHUNK = /\/assets\/firebaseAdapter-[^/]+\.js$/;

/** Records every request; blocks anything outside the app so nothing leaves the test machine. */
async function watch(page: Page): Promise<string[]> {
  const urls: string[] = [];
  page.context().on('request', (r) => urls.push(r.url()));
  await page.context().route(EXTERNAL, (route) => route.abort());
  return urls;
}

test('signed-out user: Home, a review and Settings load NO Firebase; the account section and Privacy are there', async ({ page }) => {
  const urls = await watch(page);
  await openHome(page);
  await page.getByRole('button', { name: /Today's review/ }).tap();
  await page.getByRole('button', { name: /Start/ }).tap();
  await page.getByRole('button', { name: /Show answer/ }).tap();
  await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: /Good/ }).tap();
  await expect.poll(async () => (await readDatabase(page)).reviewLogs.length).toBe(1);
  await page.goBack();
  await openHome(page);
  await page.getByRole('button', { name: /Settings/ }).tap();
  await expect(page.getByTestId('account-section')).toBeVisible();
  await expect(page.getByRole('button', { name: /Sign in with Google/ })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(urls.filter((u) => SDK_CHUNK.test(u) || EXTERNAL.test(u)), 'no Firebase before the user acts').toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('n5-kanji-review.accountHint'))).toBeNull();

  // Privacy (before sign-in), readable offline
  await page.context().setOffline(true);
  await page.getByRole('button', { name: /Read the privacy notice/ }).tap();
  await expect(page.getByRole('heading', { name: /Privacy/ }).first()).toBeVisible();
  await expect(page.getByText('n5kanjireview.support@gmail.com', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Google Privacy Policy/ })).toHaveAttribute('href', 'https://policies.google.com/privacy');
  await expect(page.getByRole('link', { name: /Privacy and Security in Firebase/ })).toHaveAttribute('href', 'https://firebase.google.com/support/privacy');
  await page.context().setOffline(false);
  expect(urls.filter((u) => SDK_CHUNK.test(u))).toEqual([]);
});

test('the SDK chunk loads only when the user taps Sign in; a sign-in that does not complete leaves the user signed out, no hint', async ({ page }) => {
  const urls = await watch(page);
  await openHome(page);
  await page.getByRole('button', { name: /Settings/ }).tap();
  expect(urls.filter((u) => SDK_CHUNK.test(u))).toEqual([]);
  page.on('popup', (popup) => void popup.close().catch(() => undefined));
  await page.getByRole('button', { name: /Sign in with Google/ }).tap();
  await expect.poll(() => urls.filter((u) => SDK_CHUNK.test(u)).length).toBe(1);
  await expect(page.getByRole('button', { name: /Sign in with Google/ })).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem('n5-kanji-review.accountHint'))).toBeNull();
});

test('C1: a hint without a Firebase session loads the SDK at start-up, then ends signed out and removes the hint', async ({ page }) => {
  const urls = await watch(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('hint-set') === null) {
      localStorage.setItem('n5-kanji-review.accountHint', '1');
      sessionStorage.setItem('hint-set', '1');
    }
  });
  await openHome(page);
  await expect.poll(() => urls.filter((u) => SDK_CHUNK.test(u)).length).toBe(1);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('n5-kanji-review.accountHint'))).toBeNull();
  await page.getByRole('button', { name: /Settings/ }).tap();
  await expect(page.getByRole('button', { name: /Sign in with Google/ })).toBeVisible();
  await expect(page.getByText(/expired or was deleted/)).toHaveCount(0); // no account error invented
});
