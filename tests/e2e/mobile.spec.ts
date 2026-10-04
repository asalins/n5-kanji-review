import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, expectTouchTarget, openHome } from './helpers';

test('home: no sideways scroll, main buttons are comfortable touch targets', async ({ page }) => {
  await openHome(page);
  await expectNoHorizontalOverflow(page);
  for (const name of [/Today's review/, /Practice/, /Search/, /Settings/]) {
    await expectTouchTarget(page.getByRole('button', { name }));
  }
});

test('review: a full session can be completed by touch, then the dashboard and its history fit the screen', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: /Today's review/ }).tap();
  await expect(page.getByText('10 ใบในรอบนี้')).toBeVisible();
  await expectTouchTarget(page.getByRole('button', { name: /Start/ }));
  await page.getByRole('button', { name: /Start/ }).tap();
  for (let i = 0; i < 10; i += 1) {
    const reveal = page.getByRole('button', { name: /Show answer/ });
    await expectTouchTarget(reveal);
    await expectNoHorizontalOverflow(page);
    await reveal.tap();
    const ratings = page.getByRole('group', { name: /remember/i });
    for (const name of [/Again/, /Hard/, /Good/, /Easy/]) await expectTouchTarget(ratings.getByRole('button', { name }));
    await expectNoHorizontalOverflow(page);
    await ratings.getByRole('button', { name: /Good/ }).tap();
  }
  await expect(page.getByText('จบรอบทบทวนแล้ว')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /History/ })).toBeVisible();
  for (const name of [/7 days/, /30 days/]) await expectTouchTarget(page.getByRole('button', { name }));
  await page.getByRole('button', { name: /30 days/ }).tap();
  await expectNoHorizontalOverflow(page);
});

test('search and filter: usable on a phone, results fit, controls are touch targets', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: /Search/ }).tap();
  const input = page.locator('#kanji-search-input');
  await expectTouchTarget(input);
  await input.fill('mizu');
  await expect(page.getByText('水').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const filter = page.locator('#kanji-state-filter');
  await expectTouchTarget(filter);
  await filter.selectOption({ index: 1 });
  const due = page.getByRole('button', { name: /Due/ });
  await expectTouchTarget(due);
  await due.tap();
  await expect(due).toHaveAttribute('aria-pressed', 'true');
  await input.fill('');
  await filter.selectOption({ index: 0 });
  await due.tap();
  await expect(page.getByText('一').first()).toBeVisible(); // all kanji again
  await expectNoHorizontalOverflow(page);
});

test('settings: limits, theme, backup and reset controls fit and respond', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: /Settings/ }).tap();
  const newCards = page.getByLabel(/New cards per day/);
  await expectTouchTarget(newCards);
  await newCards.selectOption('30');
  await expect(page.getByText(/Saved/)).toBeVisible();
  const theme = page.getByLabel(/Theme/);
  await theme.selectOption('dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#171717');
  await expectTouchTarget(page.getByRole('button', { name: /Export backup/ }));
  await expectTouchTarget(page.getByRole('button', { name: /Reset progress/ }));
  await page.getByRole('button', { name: /Reset progress/ }).tap();
  await expectTouchTarget(page.getByLabel(/I understand/).locator('xpath=..'));
  await expectTouchTarget(page.getByRole('button', { name: /Cancel/ }));
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: /Cancel/ }).tap();
  await expectTouchTarget(page.getByRole('button', { name: /Back/ }));
});

test('PWA: manifest, icons and the maskable safe zone', async ({ page, request }) => {
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as { display: string; icons: { src: string; sizes: string; purpose: string }[] };
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i) => `${i.sizes}:${i.purpose}`).sort()).toEqual(['192x192:any', '512x512:any', '512x512:maskable']);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  await openHome(page);
  // every white glyph pixel of the maskable icon lies inside the central safe circle (radius 40%)
  const outside = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/icons/icon-maskable-512.png';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, 512, 512);
    let count = 0;
    for (let y = 0; y < 512; y += 1) {
      for (let x = 0; x < 512; x += 1) {
        const i = (y * 512 + x) * 4;
        const white = data[i]! > 200 && data[i + 1]! > 200 && data[i + 2]! > 200;
        if (white && (x + 0.5 - 256) ** 2 + (y + 0.5 - 256) ** 2 > (512 * 0.4) ** 2) count += 1;
      }
    }
    return count;
  });
  expect(outside).toBe(0);
});
