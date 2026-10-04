import { expect, type Locator, type Page } from '@playwright/test';

export const MIN_TARGET = 44;

/** The page itself never scrolls sideways (inner scroll areas are allowed). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(scroll, `page is ${scroll}px wide in a ${inner}px viewport`).toBeLessThanOrEqual(inner);
}

/** Visible, at least 44x44 CSS px, and fully inside the viewport width. */
export async function expectTouchTarget(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box, 'element has a box').not.toBeNull();
  const width = target.page().viewportSize()?.width ?? 0;
  expect(box!.height, 'height >= 44').toBeGreaterThanOrEqual(MIN_TARGET);
  expect(box!.width, 'width >= 44').toBeGreaterThanOrEqual(MIN_TARGET);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
}

export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
}
