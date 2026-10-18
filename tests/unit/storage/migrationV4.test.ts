import { deleteDB, openDB, type IDBPDatabase } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepositories } from '../../../src/repositories/indexeddb';
import { DEFAULT_SYNC_META } from '../../../src/repositories/interfaces';
import { openAppDatabase, type Migration } from '../../../src/services/storage/database';
import { APP_MIGRATIONS } from '../../../src/services/storage/migrations';
import { migrationV1 } from '../../../src/services/storage/migrations/v1Initial';
import { migrationV2 } from '../../../src/services/storage/migrations/v2ContentMeta';
import { migrationV3 } from '../../../src/services/storage/migrations/v3SyncReadyLocal';
import { migrationV4 } from '../../../src/services/storage/migrations/v4SyncState';
import { DEFAULT_USER_SETTINGS } from '../../../src/services/settings/defaults';
import { StorageError } from '../../../src/utils/errors';
import { sampleRecords } from '../../helpers/backupFixtures';
import { contentBundle, streak } from '../../helpers/fixtures';
import { CURRENT_DATASET_VERSION } from '../../helpers/currentDataset';
import { uniqueDatabaseName } from '../../helpers/testDatabase';

const V3_STORES = ['contentMeta', 'deviceMeta', 'exampleSentences', 'kanji', 'kanjiReadings', 'reviewCards', 'reviewLogs', 'streakState', 'studySessions', 'userSettings', 'vocabulary'];
let name = '';
const open: { close: () => void }[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) db.close();
  await deleteDB(name);
});

/** A schema-v3 database with user data as the L1/L2 Preview app stores it. */
async function seedV3(): Promise<Record<string, unknown[]>> {
  name = uniqueDatabaseName();
  const v3 = await openAppDatabase([migrationV1, migrationV2, migrationV3], name);
  const raw = v3 as unknown as IDBPDatabase<unknown>;
  const { cards, logs, sessions } = sampleRecords();
  for (const card of cards) await raw.put('reviewCards', card);
  for (const log of logs) await raw.put('reviewLogs', log);
  for (const session of sessions) await raw.put('studySessions', session);
  await raw.put('userSettings', { ...DEFAULT_USER_SETTINGS, dailyNewCards: 30, updatedAt: 5 }, 'current');
  await raw.put('streakState', streak, 'current');
  await raw.put('contentMeta', { datasetVersion: CURRENT_DATASET_VERSION, loadedAt: 1 }, 'current');
  for (const kanji of contentBundle.kanji) await raw.put('kanji', kanji);
  v3.close();
  return dump(V3_STORES);
}

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

describe('migration v4 (sync state) on a v3 database', () => {
  it('adds two EMPTY stores and changes nothing else; an empty syncMeta means "not bound"', async () => {
    const before = await seedV3();
    const db = await openAppDatabase(APP_MIGRATIONS, name);
    open.push(db);
    expect(db.version).toBe(4);
    expect(await createIndexedDbRepositories(db).sync.getMeta()).toEqual(DEFAULT_SYNC_META);
    db.close();
    const after = await dump([...V3_STORES, 'syncLedger', 'syncMeta']);
    expect(after.__stores).toEqual([...V3_STORES, 'syncLedger', 'syncMeta'].sort());
    for (const store of V3_STORES) expect(after[store], store).toEqual(before[store]);
    expect(after.syncLedger).toEqual([]);
    expect(after.syncMeta).toEqual([]);
  });

  it('a failure aborts everything: the database stays at v3 unchanged, and the real migration works afterwards', async () => {
    const before = await seedV3();
    const broken: Migration = {
      version: 4,
      description: 'v4 then fail',
      migrate(db, tx) {
        migrationV4.migrate(db, tx);
        throw new Error('late failure');
      },
    };
    await expect(openAppDatabase([migrationV1, migrationV2, migrationV3, broken], name)).rejects.toBeInstanceOf(StorageError);
    const after = await dump(V3_STORES);
    expect(after.__version).toEqual([3]);
    expect(after.__stores).toEqual(V3_STORES);
    expect(after).toEqual(before);
    const db = await openAppDatabase(APP_MIGRATIONS, name);
    open.push(db);
    expect(db.version).toBe(4);
  });
});

describe('L4-C1 (F2): on a bound device, Reset / Import only after the cloud was replaced; same transaction', () => {
  const setup = async () => {
    name = uniqueDatabaseName();
    const db = await openAppDatabase(APP_MIGRATIONS, name);
    open.push(db);
    const repos = createIndexedDbRepositories(db);
    const { cards, logs } = sampleRecords();
    await repos.backup.replaceUserData({ reviewCards: cards, reviewLogs: logs, studySessions: [], userSettings: null });
    return repos;
  };
  const bound = async () => {
    const repos = await setup();
    await repos.sync.bind('u');
    await repos.sync.markUploaded(sampleRecords().logs.map((l) => l.id), 0);
    await repos.sync.updateMeta({ knownEpoch: 0, pullCursor: { seconds: 1, nanoseconds: 0, id: 'x' } });
    return repos;
  };

  it('not bound to an account: reset is local only and changes no sync state', async () => {
    const repos = await setup();
    await repos.backup.resetProgress();
    expect(await repos.sync.getMeta()).toEqual(DEFAULT_SYNC_META);
    expect(await repos.sync.hasLocalProgress()).toBe(false);
  });

  it('bound, WITHOUT a cloud replace (offline / refused): Reset and Import are refused and NOTHING changes (no pendingReplace)', async () => {
    const repos = await bound();
    const before = { meta: await repos.sync.getMeta(), data: await repos.backup.readUserData() };
    await expect(repos.backup.resetProgress()).rejects.toThrow(/cloud data must be replaced first/);
    await expect(repos.backup.replaceUserData({ reviewCards: [], reviewLogs: [], studySessions: [], userSettings: null })).rejects.toThrow();
    await expect(repos.backup.resetProgress({ uid: 'other', epoch: 1 })).rejects.toThrow(); // another account
    expect(await repos.sync.getMeta()).toEqual(before.meta);
    expect(await repos.backup.readUserData()).toEqual(before.data);
  });

  it('bound, after the cloud was replaced: data + ledger + sync state change together and follow the new epoch', async () => {
    const repos = await bound();
    await repos.backup.resetProgress({ uid: 'u', epoch: 1 });
    expect(await repos.sync.getMeta()).toMatchObject({ uid: 'u', knownEpoch: 1, cleanupBelow: 1, pushSettings: false, pullSettings: false, pullCursor: null, pendingReplace: false });
    expect(await repos.sync.hasLocalProgress()).toBe(false);

    const { logs } = sampleRecords();
    await repos.backup.replaceUserData({ reviewCards: [], reviewLogs: logs, studySessions: [], userSettings: null }, { uid: 'u', epoch: 2 });
    expect(await repos.sync.getMeta()).toMatchObject({ knownEpoch: 2, cleanupBelow: 2 });
    expect((await repos.sync.pendingLogs()).map((l) => l.id).sort()).toEqual(logs.map((l) => l.id).sort()); // all to upload
  });

  it('a failing import changes neither the data nor the sync state', async () => {
    const repos = await bound();
    const before = await repos.sync.getMeta();
    const bad = { ...sampleRecords().logs[0]!, rating: 'PERFECT' as never };
    await expect(repos.backup.replaceUserData({ reviewCards: [], reviewLogs: [bad], studySessions: [], userSettings: null }, { uid: 'u', epoch: 1 })).rejects.toThrow();
    expect(await repos.sync.getMeta()).toEqual(before);
    expect(await repos.sync.hasLocalProgress()).toBe(true);
  });

  it('forgetLocalProgress (sign-out / delete account "also delete progress") clears progress AND the binding', async () => {
    const repos = await setup();
    await repos.sync.bind('u');
    await repos.sync.forgetLocalProgress();
    expect(await repos.sync.getMeta()).toEqual(DEFAULT_SYNC_META);
    expect(await repos.sync.hasLocalProgress()).toBe(false);
    expect(await repos.settings.get()).toBeNull();
  });
});
