import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openHome } from './helpers';
import { readDatabase } from './idb';

// L1: a phone that already has the production app's data (schema v2) opens this build (schema v3).
test.skip(({ viewport }) => viewport?.width !== 360, 'the v2 -> v3 upgrade is checked once, on the 360 px phone');

/** Real data written by the production app (c6fdf23): its v1 backup records ARE its schema-v2 store records. */
const PRODUCTION_TEXT = readFileSync('tests/fixtures/production-backup-v1.json', 'utf8');
const PRODUCTION = JSON.parse(PRODUCTION_TEXT) as {
  data: { reviewCards: { id: string }[]; reviewLogs: { id: string }[]; studySessions: { id: string }[]; userSettings: Record<string, unknown> };
};
const STREAK = { lastStudyDate: 1_791_601_320_000, currentStreak: 3, longestStreak: 5 };

/** Creates the production schema v2 (v1 + v2 migrations, as released) with that data, before the app ever runs. */
async function seedProductionV2(page: Page): Promise<void> {
  await page.goto('/favicon.svg'); // same origin, app not started
  await page.evaluate(
    async ({ data, streak }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('n5-kanji-review', 2);
        request.onupgradeneeded = () => {
          const d = request.result;
          d.createObjectStore('kanji', { keyPath: 'id' }).createIndex('by-level', 'level');
          d.createObjectStore('kanjiReadings', { keyPath: ['kanjiId', 'type', 'kana'] }).createIndex('by-kanjiId', 'kanjiId');
          d.createObjectStore('vocabulary', { keyPath: 'id' }).createIndex('by-kanjiId', 'kanjiIds', { multiEntry: true });
          d.createObjectStore('exampleSentences', { keyPath: 'id' }).createIndex('by-vocabId', 'vocabIds', { multiEntry: true });
          const cards = d.createObjectStore('reviewCards', { keyPath: 'id' });
          cards.createIndex('by-due', 'due');
          cards.createIndex('by-state', 'state');
          d.createObjectStore('reviewLogs', { keyPath: 'id' }).createIndex('by-reviewedAt', 'reviewedAt');
          d.createObjectStore('studySessions', { keyPath: 'id' });
          d.createObjectStore('userSettings');
          d.createObjectStore('streakState');
          d.createObjectStore('contentMeta');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(['reviewCards', 'reviewLogs', 'studySessions', 'userSettings', 'streakState', 'contentMeta'], 'readwrite');
      for (const card of data.reviewCards) tx.objectStore('reviewCards').put(card);
      for (const log of data.reviewLogs) tx.objectStore('reviewLogs').put(log);
      for (const session of data.studySessions) tx.objectStore('studySessions').put(session);
      tx.objectStore('userSettings').put(data.userSettings, 'current');
      tx.objectStore('streakState').put(streak, 'current');
      // an older dataset version: the app's loader replaces the (empty) content, as on a real update
      tx.objectStore('contentMeta').put({ datasetVersion: 'n5-2026.10.01', loadedAt: 1 }, 'current');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { data: PRODUCTION.data, streak: STREAK },
  );
}

async function rawInfo(page: Page): Promise<{ version: number; deviceMeta: { deviceId: string; createdAt: number }[]; streak: unknown }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('n5-kanji-review');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const get = (store: string, op: (s: IDBObjectStore) => IDBRequest) =>
      new Promise<unknown>((resolve, reject) => {
        const r = op(db.transaction(store).objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const out = {
      version: db.version,
      deviceMeta: db.objectStoreNames.contains('deviceMeta') ? ((await get('deviceMeta', (s) => s.getAll())) as { deviceId: string; createdAt: number }[]) : [],
      streak: await get('streakState', (s) => s.get('current')),
    };
    db.close();
    return out;
  });
}

const byId = <T extends { id: string }>(list: readonly T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));

test('production data (schema v2) survives the upgrade to v3 (and v4) unchanged; new reviews use the new ids; identity is stable', async ({ page }) => {
  await seedProductionV2(page);
  await openHome(page);

  const db = await readDatabase(page);
  const info = await rawInfo(page);
  expect(info.version).toBe(4); // v3 (this test's subject), then v4 (empty sync stores)
  expect(info.deviceMeta).toHaveLength(1);
  expect(info.deviceMeta[0]!.deviceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(byId(db.reviewCards as { id: string }[])).toEqual(byId(PRODUCTION.data.reviewCards));
  expect(byId(db.studySessions as { id: string }[])).toEqual(byId(PRODUCTION.data.studySessions));
  expect(byId(db.reviewLogs as { id: string }[])).toEqual(byId(PRODUCTION.data.reviewLogs.map((l) => ({ ...l, deviceId: null, originalId: null }))));
  expect(db.userSettings).toEqual([{ ...PRODUCTION.data.userSettings, updatedAt: 0 }]);
  expect(info.streak).toEqual(STREAK);
  expect(db.kanjiCount).toBe(196); // the loader filled the content without touching user data
  const deviceId = info.deviceMeta[0]!.deviceId;

  // a real review after the upgrade
  await page.getByRole('button', { name: /Today's review/ }).tap();
  await page.getByRole('button', { name: /Start/ }).tap();
  await page.getByRole('button', { name: /Show answer/ }).tap();
  await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: /Good/ }).tap();
  await expect.poll(async () => (await readDatabase(page)).reviewLogs.length).toBe(PRODUCTION.data.reviewLogs.length + 1);
  const logs = (await readDatabase(page)).reviewLogs as { id: string; deviceId: string | null; originalId: string | null }[];
  const fresh = logs.filter((l) => !PRODUCTION.data.reviewLogs.some((p) => p.id === l.id));
  expect(fresh).toHaveLength(1);
  expect(fresh[0]!.id).toMatch(/^log:[0-9a-f-]{36}$/);
  expect(fresh[0]).toMatchObject({ deviceId, originalId: null });

  // closing/reopening keeps the identity
  await page.reload();
  await openHome(page);
  expect((await rawInfo(page)).deviceMeta).toEqual(info.deviceMeta);

  // Import (Replace) of the production backup: data replaced, identity untouched
  await page.getByRole('button', { name: /Settings/ }).tap();
  await page.getByLabel(/Import backup/).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(PRODUCTION_TEXT) });
  const dialog = page.getByRole('alertdialog', { name: /Import this backup/ });
  await dialog.getByLabel(/I understand/).check();
  await dialog.getByRole('button', { name: /Replace my data/ }).tap();
  await expect(page.getByText(/Backup restored/)).toBeVisible();
  expect((await rawInfo(page)).deviceMeta).toEqual(info.deviceMeta);
  expect(byId((await readDatabase(page)).reviewLogs as { id: string }[]).map((l) => l.id)).toEqual(byId(PRODUCTION.data.reviewLogs).map((l) => l.id));

  // export is format 2 and carries no installation identity
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export backup/ }).tap()]);
  const exported = readFileSync((await download.path())!, 'utf8');
  expect(JSON.parse(exported)).toMatchObject({ formatVersion: 2, databaseSchemaVersion: 4 });
  expect(exported).not.toContain('deviceMeta');
  expect(exported).not.toMatch(/syncLedger|syncMeta/); // sync state is never in a backup
  expect(exported).not.toContain(deviceId); // the only log from this device was replaced by the import
});
