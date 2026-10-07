import { expect, test } from '@playwright/test';
import { openHome } from './helpers';

test('offline after the first load: the app shell, stored progress, search and settings still work', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone-360', 'one viewport is enough for the offline check');
  await openHome(page);
  // the generated service worker installs on the first visit and controls the page from the next load
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // some real progress, stored in IndexedDB
  await page.getByRole('button', { name: /Today's review/ }).tap();
  await page.getByRole('button', { name: /Start/ }).tap();
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: /Show answer/ }).tap();
    await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: /Good/ }).tap();
    // the session only moves on after the review is stored, so this waits for the write
    await expect(page.getByText(`Card ${i + 2} of`)).toBeVisible();
  }

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
  // progress survived the reload and offline start: 3 reviews today
  const reviewsToday = page.locator('dt', { hasText: /Reviews today/ }).locator('xpath=..');
  await expect(reviewsToday).toContainText('3');

  await page.getByRole('button', { name: /Search/ }).tap();
  await page.locator('#kanji-search-input').fill('mizu');
  await expect(page.getByText('水').first()).toBeVisible();
  await page.getByRole('button', { name: /Details 水/ }).tap();
  await expect(page.getByTestId('detail-strokes')).toBeVisible();
  await page.getByRole('button', { name: /← ค้นหา · Search/ }).tap();
  await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).tap();
  await page.getByLabel(/Reviews per day/).selectOption('50');
  await expect(page.getByText(/Saved/)).toBeVisible();
  await context.setOffline(false);
});
