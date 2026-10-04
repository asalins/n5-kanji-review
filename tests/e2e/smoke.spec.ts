import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, openHome } from './helpers';

// Desktop (1024, 1440) and landscape phones (812x360, 915x412): the main screens work and never scroll sideways.

test('home, review, dashboard, search and settings', async ({ page }) => {
  await openHome(page);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: /Today's review/ }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await page.getByRole('button', { name: /Show answer/ }).click();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: /Good/ }).click();
  await expect(page.getByText('Card 2 of')).toBeVisible();

  await page.goto('/');
  await expect(page.locator('dt', { hasText: /Reviews today/ }).locator('xpath=..')).toContainText('1');
  await page.getByRole('button', { name: /30 days/ }).click();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: /Search/ }).click();
  await page.locator('#kanji-search-input').fill('mizu');
  await expect(page.getByText('水').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto('/');
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByLabel(/Reviews per day/).selectOption('50');
  await expect(page.getByText(/Saved/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
