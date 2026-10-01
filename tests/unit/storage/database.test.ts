import { afterEach, describe, expect, it, vi } from 'vitest';
import { openAppDatabase, assertValidMigrations, type Migration } from '../../../src/services/storage/database';
import { CURRENT_DB_VERSION } from '../../../src/services/storage/appDatabase';
import { APP_MIGRATIONS } from '../../../src/services/storage/migrations';
import { STORES } from '../../../src/services/storage/schema';
import { StorageError } from '../../../src/utils/errors';
import { openTestDatabase, uniqueDatabaseName } from '../../helpers/testDatabase';

const EXPECTED_INDEXES: Record<string, string[]> = {
  kanji: ['by-level'],
  kanjiReadings: ['by-kanjiId'],
  vocabulary: ['by-kanjiId'],
  exampleSentences: ['by-vocabId'],
  reviewCards: ['by-due', 'by-state'],
  reviewLogs: ['by-reviewedAt'],
  studySessions: [],
  userSettings: [],
  streakState: [],
};

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

describe('database', () => {
  it('opens at the current version', async () => {
    const { db, dispose } = await openTestDatabase();
    disposers.push(dispose);
    expect(CURRENT_DB_VERSION).toBe(1);
    expect(db.version).toBe(CURRENT_DB_VERSION);
  });

  it('creates exactly the expected stores and indexes', async () => {
    const { db, dispose } = await openTestDatabase();
    disposers.push(dispose);
    expect([...db.objectStoreNames].sort()).toEqual(Object.values(STORES).sort());
    for (const [store, indexes] of Object.entries(EXPECTED_INDEXES)) {
      const tx = db.transaction(store as keyof typeof STORES);
      expect([...tx.store.indexNames].sort()).toEqual(indexes);
    }
  });

  it('configures multiEntry indexes for array fields', async () => {
    const { db, dispose } = await openTestDatabase();
    disposers.push(dispose);
    expect(db.transaction('vocabulary').store.index('by-kanjiId').multiEntry).toBe(true);
    expect(db.transaction('exampleSentences').store.index('by-vocabId').multiEntry).toBe(true);
  });

  it('fails with StorageError when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(openAppDatabase(APP_MIGRATIONS, uniqueDatabaseName())).rejects.toBeInstanceOf(StorageError);
  });
});

describe('migrations', () => {
  const makeMigration = (version: number, log: number[]): Migration => ({
    version,
    description: `v${version}`,
    migrate: (db) => {
      log.push(version);
      db.createObjectStore(`test-store-${version}` as never);
    },
  });

  it('fresh install runs every migration once, in ascending order', async () => {
    const log: number[] = [];
    const { db, dispose } = await openTestDatabase([makeMigration(3, log), makeMigration(1, log), makeMigration(2, log)]);
    disposers.push(dispose);
    expect(log).toEqual([1, 2, 3]);
    expect(db.version).toBe(3);
  });

  it('sequential upgrade only runs the new migrations and keeps existing data', async () => {
    const name = uniqueDatabaseName();
    const log: number[] = [];
    const first = await openTestDatabase([makeMigration(1, log)], name);
    await first.db.put('test-store-1' as never, { id: 'keep' } as never, 'k' as never);
    first.db.close();

    const second = await openAppDatabase([makeMigration(1, log), makeMigration(2, log)], name);
    disposers.push(async () => {
      second.close();
      await first.dispose().catch(() => undefined);
    });
    expect(log).toEqual([1, 2]); // v1 not re-run on upgrade
    expect(second.version).toBe(2);
    expect(await second.get('test-store-1' as never, 'k' as never)).toEqual({ id: 'keep' });
  });

  it('rejects migration lists that skip a version or repeat one', () => {
    const noop = () => undefined;
    const m = (version: number): Migration => ({ version, description: 'x', migrate: noop });
    expect(() => assertValidMigrations([m(1), m(3)])).toThrow(StorageError);
    expect(() => assertValidMigrations([m(1), m(1)])).toThrow(StorageError);
    expect(() => assertValidMigrations([m(2)])).toThrow(StorageError);
    expect(() => assertValidMigrations([m(2), m(1)])).not.toThrow();
  });

  it('is deterministic: two fresh installs have identical structure', async () => {
    const a = await openTestDatabase();
    const b = await openTestDatabase();
    disposers.push(a.dispose, b.dispose);
    const describeDb = (db: typeof a.db) =>
      [...db.objectStoreNames].sort().map((store) => {
        const s = db.transaction(store as keyof typeof STORES).store;
        return { store, keyPath: s.keyPath, indexes: [...s.indexNames].sort() };
      });
    expect(describeDb(a.db)).toEqual(describeDb(b.db));
  });

  it('the registered history is sequential', () => {
    expect(() => assertValidMigrations(APP_MIGRATIONS)).not.toThrow();
  });
});
