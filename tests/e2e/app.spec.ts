import { expect, test } from '@playwright/test';

test('application starts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
});
