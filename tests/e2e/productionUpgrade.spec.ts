import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { readDatabase } from './idb';
import { SwitchableServer } from './staticServer';

/**
 * L1: the REAL production build (schema v2) creates the data, then this build (schema v3) is deployed on the same
 * origin and the user taps Update — exactly what happens on a phone. Needs the production `dist`:
 *   N5_BASELINE_DIST=/path/to/c6fdf23/dist
 * Without it this test is reported as skipped (never as passed); migrationV3.spec.ts covers the upgrade without it.
 */
const BASELINE = process.env.N5_BASELINE_DIST ?? '';
test.skip(({ viewport }) => viewport?.width !== 360, 'checked once, on the 360 px phone');
test.skip(() => BASELINE === '' || !existsSync(join(BASELINE, 'sw.js')), 'N5_BASELINE_DIST (production build) not provided');

const PORT = 4191;

test('production build data -> Update to this build: every record kept, schema v3, identity created once', async ({ page }) => {
  const work = mkdtempSync(join(tmpdir(), 'n5-l1-'));
  const production = join(work, 'production');
  const next = join(work, 'next');
  cpSync(BASELINE, production, { recursive: true });
  cpSync('dist', next, { recursive: true });
  const server = new SwitchableServer(production, PORT);
  await server.start();
  try {
    await page.goto(`${server.url}/`);
    await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    // real production data: 3 reviews and a saved setting
    await page.getByRole('button', { name: /Today's review/ }).tap();
    await page.getByRole('button', { name: /Start/ }).tap();
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole('button', { name: /Show answer/ }).tap();
      await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: i === 1 ? /Again/ : /Good/ }).tap();
      await expect.poll(async () => (await readDatabase(page)).reviewLogs.length).toBe(i + 1);
    }
    await page.goto(`${server.url}/`);
    await page.getByRole('button', { name: /Settings/ }).tap();
    await page.getByLabel(/New cards per day/).selectOption('20');
    await expect(page.getByText(/Saved/)).toBeVisible();
    await expect.poll(async () => (await readDatabase(page)).userSettings.length).toBe(1);
    await page.goto(`${server.url}/`);
    await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
    const before = await readDatabase(page);
    expect(before.reviewLogs).toHaveLength(3);
    expect((before.reviewLogs as { id: string }[]).every((l) => /#\d+$/.test(l.id))).toBe(true); // production ids

    // deploy this build; the user taps Update
    server.deploy(next);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
    await expect(page.getByText(/A new version is available/)).toBeVisible({ timeout: 15_000 });
    await Promise.all([page.waitForEvent('framenavigated'), page.getByRole('button', { name: /Update/ }).tap()]);
    await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();

    const { version, devices } = await page.evaluate(
      () =>
        new Promise<{ version: number; devices: number }>((resolve) => {
          const r = indexedDB.open('n5-kanji-review');
          r.onsuccess = () => {
            const db = r.result;
            const count = db.transaction('deviceMeta').objectStore('deviceMeta').count();
            count.onsuccess = () => {
              resolve({ version: db.version, devices: count.result });
              db.close();
            };
          };
        }),
    );
    expect(version).toBe(3);
    expect(devices).toBe(1);
    const after = await readDatabase(page);
    expect(after.reviewCards).toEqual(before.reviewCards);
    expect(after.studySessions).toEqual(before.studySessions);
    expect(after.reviewLogs).toEqual((before.reviewLogs as object[]).map((l) => ({ ...l, deviceId: null, originalId: null })));
    expect(after.userSettings).toEqual((before.userSettings as object[]).map((s) => ({ ...s, updatedAt: 0 })));
    expect(after.streakState).toEqual(before.streakState);
    expect(after.contentMeta).toEqual(before.contentMeta);
    await expect(page.locator('dt', { hasText: /Reviews today/ }).locator('xpath=..')).toContainText('3');
  } finally {
    await server.stop();
    rmSync(work, { recursive: true, force: true });
  }
});
