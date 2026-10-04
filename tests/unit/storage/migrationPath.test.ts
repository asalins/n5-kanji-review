import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepositories } from '../../../src/repositories/indexeddb';
import { openAppDatabase, type AppDatabase } from '../../../src/services/storage/database';
import { APP_MIGRATIONS } from '../../../src/services/storage/migrations';
import { migrationV1 } from '../../../src/services/storage/migrations/v1Initial';
import { DEFAULT_USER_SETTINGS } from '../../../src/services/settings/defaults';
import { sampleRecords } from '../../helpers/backupFixtures';
import { contentBundle, streak } from '../../helpers/fixtures';
import { uniqueDatabaseName } from '../../helpers/testDatabase';

const opened: AppDatabase[] = [];
let name = '';
afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  await deleteDB(name);
});

/** The v1 schema exactly as released (Phase 2). If v1 ever creates something else, history was rewritten. */
const V1_STORES = ['exampleSentences', 'kanji', 'kanjiReadings', 'reviewCards', 'reviewLogs', 'streakState', 'studySessions', 'userSettings', 'vocabulary'];

describe('real upgrade path: a v1 database with user data, opened by the current app (v1 -> v2)', () => {
  it('keeps every card, log, session, setting, streak record and content record, and adds contentMeta', async () => {
    name = uniqueDatabaseName();
    const v1 = await openAppDatabase([migrationV1], name);
    opened.push(v1);
    expect(v1.version).toBe(1);
    expect([...v1.objectStoreNames].sort()).toEqual(V1_STORES);

    // realistic user data written the way v1 stored it (raw stores: the v1 era had no contentMeta)
    const { cards, logs, sessions } = sampleRecords();
    const settings = { ...DEFAULT_USER_SETTINGS, dailyNewCards: 30 };
    const raw = v1 as unknown as { put: (store: string, value: unknown, key?: string) => Promise<unknown> };
    for (const card of cards) await raw.put('reviewCards', card);
    for (const log of logs) await raw.put('reviewLogs', log);
    for (const session of sessions) await raw.put('studySessions', session);
    await raw.put('userSettings', settings, 'current');
    await raw.put('streakState', streak, 'current');
    for (const kanji of contentBundle.kanji) await raw.put('kanji', kanji);
    for (const reading of contentBundle.readings) await raw.put('kanjiReadings', reading);
    v1.close();

    const current = await openAppDatabase(APP_MIGRATIONS, name);
    opened.push(current);
    expect(current.version).toBe(2);
    expect([...current.objectStoreNames].sort()).toEqual([...V1_STORES, 'contentMeta'].sort());

    const repos = createIndexedDbRepositories(current);
    const data = await repos.backup.readUserData();
    const byId = <T extends { id: string }>(list: readonly T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(data.reviewCards).toEqual(byId(cards));
    expect(data.reviewLogs).toEqual(byId(logs));
    expect(data.studySessions).toEqual(byId(sessions));
    expect(data.userSettings).toEqual(settings);
    expect(await repos.review.getStreakState()).toEqual(streak);
    expect(await repos.kanji.getById(contentBundle.kanji[0]!.id)).toEqual(contentBundle.kanji[0]);
    expect(await repos.kanji.getDatasetVersion()).toBeNull(); // contentMeta is new and empty: the loader fills it
    // indexes from v1 still work after the upgrade
    expect((await repos.review.getCardsByStates(['MASTERED'])).map((c) => c.id)).toEqual([cards[2]!.id]);
  });

  it('opening an already-current database again runs no migration and changes nothing', async () => {
    name = uniqueDatabaseName();
    const first = await openAppDatabase(APP_MIGRATIONS, name);
    await createIndexedDbRepositories(first).review.saveCard(sampleRecords().cards[0]!);
    first.close();
    const again = await openAppDatabase(APP_MIGRATIONS, name);
    opened.push(again);
    expect(again.version).toBe(2);
    expect(await createIndexedDbRepositories(again).review.getCard(sampleRecords().cards[0]!.id)).toEqual(sampleRecords().cards[0]);
  });

  it('a database newer than the app is not silently downgraded or wiped (open fails, data stays)', async () => {
    name = uniqueDatabaseName();
    const future = await openDB(name, 3, { upgrade: (db) => void db.createObjectStore('reviewCards', { keyPath: 'id' }) });
    await future.put('reviewCards', { id: 'kept' });
    future.close();
    await expect(openAppDatabase(APP_MIGRATIONS, name)).rejects.toThrow();
    const check = await openDB(name);
    expect(await check.get('reviewCards', 'kept')).toEqual({ id: 'kept' });
    check.close();
  });
});

describe('released migrations are immutable', () => {
  // Fingerprints of the released files. Never update these: change the schema with a NEW migration (v3, ...).
  const RELEASED: Record<string, string> = {
    'src/services/storage/migrations/v1Initial.ts': '74ae1ab918aa4cbcc28476ad47fb46ec759125143468c71108f7c624be6ca9ab',
    'src/services/storage/migrations/v2ContentMeta.ts': 'a944a7e05bf2ba496d7aa94f493fc3791833f4d0e1139df4d1c6f2c68ec9760c',
  };
  it.each(Object.entries(RELEASED))('%s is unchanged since release', (path, fingerprint) => {
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(actual, `${path} was edited. Released migrations must never change: add a new migration instead.`).toBe(fingerprint);
  });
  it('the migration list only grows: v1 and v2 are still first, in order', () => {
    expect(APP_MIGRATIONS.slice(0, 2).map((m) => m.version)).toEqual([1, 2]);
  });
});
