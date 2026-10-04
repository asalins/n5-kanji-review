import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { SwitchableServer } from './staticServer';

test.skip(({ viewport }) => viewport?.width !== 360, 'the update lifecycle is checked once, on the 360 px phone');

const PORT = 4190;

test('a new version waits, never reloads by itself, and keeps user data when the user taps Update', async ({ page }) => {
  // Version A = the production build under test; Version B = the same build with a changed service worker.
  const work = mkdtempSync(join(tmpdir(), 'n5-update-'));
  const versionA = join(work, 'a');
  const versionB = join(work, 'b');
  cpSync('dist', versionA, { recursive: true });
  cpSync('dist', versionB, { recursive: true });
  appendFileSync(join(versionB, 'sw.js'), '\n// version B\n');
  const server = new SwitchableServer(versionA, PORT);
  await server.start();
  try {
    await page.goto(`${server.url}/`);
    await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    // user data in IndexedDB
    await page.getByRole('button', { name: /Today's review/ }).tap();
    await page.getByRole('button', { name: /Start/ }).tap();
    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('button', { name: /Show answer/ }).tap();
      await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: /Good/ }).tap();
      await expect(page.getByText(`Card ${i + 2} of`)).toBeVisible();
    }
    await page.goto(`${server.url}/`);
    await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
    });

    // deploy Version B and let the browser find it
    server.deploy(versionB);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });

    // the new worker waits and the user is told, but nothing reloads
    await expect(page.getByText(/A new version is available/)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting !== null)).toBe(true);
    await page.waitForTimeout(3_000);
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
    await expect(page.getByText(/A new version is available/)).toBeVisible();

    // only the user's tap applies it
    await Promise.all([page.waitForEvent('framenavigated'), page.getByRole('button', { name: /Update/ }).tap()]);
    await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBeUndefined();
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting ?? null)).toBeNull();
    const activeScript = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active ? (await fetch(registration.active.scriptURL)).text() : '';
    });
    expect(activeScript).toContain('version B');
    // user data survived the update
    await expect(page.locator('dt', { hasText: /Reviews today/ }).locator('xpath=..')).toContainText('2');
    await expect(page.getByText(/A new version is available/)).toHaveCount(0);
  } finally {
    await server.stop();
    rmSync(work, { recursive: true, force: true });
  }
});
