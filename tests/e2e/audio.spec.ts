import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, expectTouchTarget, openHome } from './helpers';

/**
 * Audio before any file exists: every play button falls back to the device voice. Headless Chromium may
 * have no Japanese voice, so the outcome is either "playing" or the honest "no Japanese voice" message,
 * never a crash, a wrong-language voice or a request for an audio file.
 */
test('kanji detail audio: touch-sized play and speed buttons, a visible result, no layout break', async ({ page }) => {
  const audioRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/audio\/|\.mp3(\?|$)/.test(request.url())) audioRequests.push(request.url());
  });
  await openHome(page);
  await page.getByRole('button', { name: /Search/ }).tap();
  await page.locator('#kanji-search-input').fill('sei');
  await page.getByRole('button', { name: /Details 生/ }).tap();
  await expect(page.getByRole('heading', { name: /Kanji detail/ })).toBeVisible();

  const plays = page.getByTestId('play-audio');
  expect(await plays.count()).toBeGreaterThan(5);
  await expectTouchTarget(plays.first());
  for (const speed of ['0.75x', '1x', '1.25x']) await expectTouchTarget(page.getByRole('button', { name: speed, exact: true }));

  await page.getByRole('button', { name: '0.75x', exact: true }).tap();
  await expect(page.getByRole('button', { name: '0.75x', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await plays.first().tap();
  const status = page.getByRole('status').filter({ hasText: /กำลังเล่น|ไม่มีเสียงภาษาญี่ปุ่น|เล่นเสียงไม่สำเร็จ|เล่นเสียงไม่ได้/ });
  await expect(status.first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(audioRequests).toEqual([]);
});
