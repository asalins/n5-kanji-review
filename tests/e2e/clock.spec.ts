import { expect, test, type Page } from '@playwright/test';
import { openHome } from './helpers';

/**
 * L4-R F10-A in the real browser with the real service worker: the clock check is a network answer (never the
 * service worker, never a cache), and a device clock one day ahead blocks only the RECORDED review.
 */
test.skip(({ viewport }) => viewport?.width !== 360, 'checked once, on the 360 px phone');

const isClockCheck = (url: string) => url.includes('/favicon.svg?clock-check=');

async function controlledBySw(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test('the clock check is a HEAD to the network (not the service worker) and carries a Date', async ({ page }) => {
  await openHome(page);
  await controlledBySw(page);
  const answer = page.waitForResponse((r) => isClockCheck(r.url()));
  await page.reload();
  const response = await answer;
  expect(response.request().method()).toBe('HEAD');
  expect(response.fromServiceWorker()).toBe(false);
  expect(Number.isFinite(Date.parse((await response.allHeaders())['date'] ?? ''))).toBe(true);
});

for (const [label, offset, text] of [['ahead', 86_400_000, /ahead by 1 day/], ['behind', -86_400_000, /behind by 1 day/]] as const) {
  test(`device clock one day ${label} (online): Today's review is blocked with an explanation; practice still works`, async ({ page }) => {
    await page.clock.install({ time: Date.now() + offset });
    await openHome(page);
    await page.getByRole('button', { name: /Today's review/ }).tap();
    await expect(page.getByText(/This device’s clock is wrong/)).toBeVisible();
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByRole('button', { name: /Start/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'กลับหน้าหลัก' }).tap();
    await page.getByRole('button', { name: /Practice/ }).tap();
    await expect(page.getByText(/This device’s clock is wrong/)).toHaveCount(0);
  });
}

test('offline (time cannot be checked): reviews are recorded as before, with a note that the time is unverified', async ({ page, context }) => {
  await openHome(page);
  await controlledBySw(page);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /Today's review/ }).tap();
  await expect(page.getByText(/Offline: the time cannot be checked/)).toBeVisible();
  await page.getByRole('button', { name: /Start/ }).tap();
  await page.getByRole('button', { name: /Show answer/ }).tap();
  await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: /Good/ }).tap();
  await expect(page.getByText('Card 2 of')).toBeVisible();
  await context.setOffline(false);
});
