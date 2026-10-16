import { deleteDB, openDB, type IDBPDatabase } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepositories } from '../../../src/repositories/indexeddb';
import { openAppDatabase, type Migration } from '../../../src/services/storage/database';
import { APP_MIGRATIONS } from '../../../src/services/storage/migrations';
import { migrationV1 } from '../../../src/services/storage/migrations/v1Initial';
import { migrationV2 } from '../../../src/services/storage/migrations/v2ContentMeta';
import { createMigrationV3 } from '../../../src/services/storage/migrations/v3SyncReadyLocal';
import { srsV1 } from '../../../src/services/srs';
import { buildAppServices } from '../../../src/app/bootstrap';
import { DEFAULT_USER_SETTINGS } from '../../../src/services/settings/defaults';
import { StorageError } from '../../../src/utils/errors';
import { isUuidV4 } from '../../../src/utils/uuid';
import { sampleRecords } from '../../helpers/backupFixtures';
import { contentBundle, streak } from '../../helpers/fixtures';
import { CURRENT_DATASET_VERSION } from '../../helpers/currentDataset';
import { uniqueDatabaseName } from '../../helpers/testDatabase';

const V2_STORES = ['contentMeta', 'exampleSentences', 'kanji', 'kanjiReadings', 'reviewCards', 'reviewLogs', 'streakState', 'studySessions', 'userSettings', 'vocabulary'];
let name = '';
const open: { close: () => void }[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) db.close();
  await deleteDB(name);
});

/** A schema-v2 database with user data exactly as the production app (c6fdf23) stores it. */
async function seedV2(): Promise<Record<string, unknown[]>> {
  name = uniqueDatabaseName();
  const v2 = await openAppDatabase([migrationV1, migrationV2], name);
  const raw = v2 as unknown as IDBPDatabase<unknown>;
  const { cards, logs, sessions } = sampleRecords();
  for (const card of cards) await raw.put('reviewCards', card);
  for (const { deviceId: _d, originalId: _o, ...log } of logs) await raw.put('reviewLogs', log);
  for (const session of sessions) await raw.put('studySessions', session);
  const { updatedAt: _u, ...settings } = { ...DEFAULT_USER_SETTINGS, dailyNewCards: 30, theme: 'dark' as const };
  await raw.put('userSettings', settings, 'current');
  await raw.put('streakState', streak, 'current');
  await raw.put('contentMeta', { datasetVersion: CURRENT_DATASET_VERSION, loadedAt: 1 }, 'current');
  for (const kanji of contentBundle.kanji) await raw.put('kanji', kanji);
  for (const reading of contentBundle.readings) await raw.put('kanjiReadings', reading);
  v2.close();
  return dump(V2_STORES);
}

/** Every record (with its key) of every store, read raw. */
async function dump(stores: readonly string[]): Promise<Record<string, unknown[]>> {
  const db = await openDB(name);
  const out: Record<string, unknown[]> = {};
  for (const store of stores) {
    if (!db.objectStoreNames.contains(store)) continue;
    const tx = db.transaction(store);
    const keys = await tx.store.getAllKeys();
    const values = await tx.store.getAll();
    out[store] = keys.map((k, i) => [k, values[i]]);
  }
  out.__version = [db.version];
  out.__stores = [...db.objectStoreNames].sort();
  db.close();
  return out;
}

describe('migration v3 on a production-shaped v2 database', () => {
  it('keeps every record and key; logs gain deviceId/originalId null; settings gain updatedAt 0; deviceMeta is created', async () => {
    const before = await seedV2();
    const db = await openAppDatabase(APP_MIGRATIONS, name);
    open.push(db);
    expect(db.version).toBe(3);
    db.close();
    const after = await dump([...V2_STORES, 'deviceMeta']);
    expect(after.__stores).toEqual([...V2_STORES, 'deviceMeta'].sort());

    // untouched stores: byte-for-byte the same records under the same keys
    for (const store of ['reviewCards', 'studySessions', 'streakState', 'contentMeta', 'kanji', 'kanjiReadings', 'vocabulary', 'exampleSentences']) {
      expect(after[store], store).toEqual(before[store]);
    }
    // logs: same keys, same content, plus the two provenance fields
    expect((after.reviewLogs as [string, object][]).map(([k]) => k)).toEqual((before.reviewLogs as [string, object][]).map(([k]) => k));
    expect(after.reviewLogs).toEqual((before.reviewLogs as [string, object][]).map(([k, v]) => [k, { ...v, deviceId: null, originalId: null }]));
    expect(after.userSettings).toEqual((before.userSettings as [string, object][]).map(([k, v]) => [k, { ...v, updatedAt: 0 }]));
    const [[key, meta]] = after.deviceMeta as [[string, { deviceId: string; createdAt: number }]];
    expect(key).toBe('current');
    expect(isUuidV4(meta.deviceId)).toBe(true);
    expect(meta.createdAt).toBeGreaterThan(0);
  });

  it('SRS, statistics inputs, streak and cards are unchanged by the migration alone; the next review uses the new id scheme', async () => {
    await seedV2();
    const v2Cards = sampleRecords().cards;
    const db = await openAppDatabase(APP_MIGRATIONS, name);
    open.push(db);
    const repos = createIndexedDbRepositories(db);
    const range = { from: new Date(0), to: new Date(8.64e15) };
    expect((await repos.review.getDueCards(new Date(2_000_000_000_000), 100)).map((c) => c.id).sort()).toEqual(
      v2Cards.filter((c) => c.state !== 'NEW' && c.due <= 2_000_000_000_000).map((c) => c.id).sort(),
    );
    expect(await repos.review.getStreakState()).toEqual(streak);
    expect((await repos.review.getLogs(range)).map((l) => [l.id, l.reviewedAt, l.rating])).toEqual(
      sampleRecords().logs.sort((a, b) => a.reviewedAt - b.reviewedAt).map((l) => [l.id, l.reviewedAt, l.rating]),
    );

    // a review after the migration: same SRS result as on the unmigrated card, new log id + this device
    const card = v2Cards[0]!;
    const at = card.due + 60_000;
    await buildAppServices(repos).reviewOrchestrator!.submit({ item: { itemType: card.itemType, itemId: card.itemId }, mode: card.mode, rating: 'GOOD', answeredAt: at, durationMs: 1 });
    expect(await repos.review.getCard(card.id)).toEqual(srsV1.updateCardState(card, 'GOOD', at).card);
    const logs = await repos.review.getLogs(range);
    const newest = logs.find((l) => l.reviewedAt === at)!;
    expect(newest.id).toMatch(/^log:[0-9a-f-]{36}$/);
    expect(newest.deviceId).toBe(await repos.device.getDeviceId());
    expect(logs).toHaveLength(sampleRecords().logs.length + 1); // every old log still there
  });

  it.each([
    ['before anything is written (id generation fails)', createMigrationV3({ newId: () => { throw new Error('boom'); }, now: () => 1 })],
    ['after deviceMeta and every log were rewritten', {
      version: 3,
      description: 'v3 then fail',
      async migrate(db, tx) {
        await createMigrationV3({ newId: () => 'd', now: () => 1 }).migrate(db, tx);
        throw new Error('late failure');
      },
    } satisfies Migration],
  ])('a failure %s aborts everything: the database stays at v2 with every record unchanged', async (_label, broken) => {
    const before = await seedV2();
    await expect(openAppDatabase([migrationV1, migrationV2, broken], name)).rejects.toBeInstanceOf(StorageError);
    const after = await dump(V2_STORES);
    expect(after.__version).toEqual([2]);
    expect(after.__stores).toEqual(V2_STORES); // no deviceMeta
    expect(after).toEqual(before);
    // and the real migration still succeeds afterwards
    const db = await openAppDatabase(APP_MIGRATIONS, name);
    open.push(db);
    expect(db.version).toBe(3);
  });

  it('the installation id is created once and survives closing/reopening the app', async () => {
    await seedV2();
    const first = await openAppDatabase(APP_MIGRATIONS, name);
    const id = await createIndexedDbRepositories(first).device.getDeviceId();
    first.close();
    const again = await openAppDatabase(APP_MIGRATIONS, name);
    open.push(again);
    expect(await createIndexedDbRepositories(again).device.getDeviceId()).toBe(id);
  });
});
