import { afterEach, describe, expect, it } from 'vitest';
import { buildAppServices } from '../../../src/app/bootstrap';
import { createIndexedDbRepositories, type Repositories } from '../../../src/repositories/indexeddb';
import { DEFAULT_USER_SETTINGS } from '../../../src/services/settings/defaults';
import { CloudError, PUSH_BATCH } from '../../../src/services/sync/cloudTypes';
import { replayAll } from '../../../src/services/sync/replay';
import { runSyncCycle, type SyncOutcome } from '../../../src/services/sync/syncEngine';
import type { ReviewLog, ReviewRating, StudyMode } from '../../../src/types/entities';
import { MemoryCloud } from '../../helpers/memoryCloud';
import { openTestDatabase } from '../../helpers/testDatabase';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of disposers.splice(0)) await d();
});

const KANJI = ['U+6C34', 'U+706B', 'U+5C71', 'U+6728', 'U+91D1'];
let clock = 1_800_000_000_000;

async function device(cloud: MemoryCloud, signedInAs: () => string | null) {
  const { db, dispose } = await openTestDatabase();
  disposers.push(dispose);
  const repos: Repositories = createIndexedDbRepositories(db);
  const services = buildAppServices(repos);
  return {
    repos,
    async review(k: number, mode: StudyMode, rating: ReviewRating) {
      clock += 60_000;
      await services.reviewOrchestrator!.submit({ item: { itemType: 'kanji', itemId: `kanji:${KANJI[k]!}` }, mode, rating, answeredAt: clock, durationMs: 900 });
    },
    sync: (): Promise<SyncOutcome> => runSyncCycle({ repo: repos.sync, cloud: cloud.as(signedInAs), now: () => clock }),
    data: () => repos.backup.readUserData(),
  };
}

/** Both devices hold the same logs, and every card equals the replay of those logs (D4). */
async function expectConverged(...devices: Awaited<ReturnType<typeof device>>[]) {
  const [first, ...rest] = await Promise.all(devices.map((d) => d.data()));
  for (const other of rest) {
    expect(other.reviewLogs).toEqual(first!.reviewLogs);
    expect(other.reviewCards).toEqual(first!.reviewCards);
  }
  expect(first!.reviewCards).toEqual([...replayAll(first!.reviewLogs).values()].sort((a, b) => (a.id < b.id ? -1 : 1)));
}

const synced = (o: SyncOutcome) => {
  expect(o.kind).toBe('synced');
  return o as Extract<SyncOutcome, { kind: 'synced' }>;
};

describe('sync engine (in-memory cloud mirroring the rules; the real rules are tested on the Emulator)', () => {
  it('two devices review offline, then sync: same logs, same cards, equal to the replay', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'alice');
    const b = await device(cloud, () => 'alice');
    await a.review(0, 'A', 'GOOD');
    await b.review(0, 'A', 'AGAIN'); // the same card on both devices
    await a.review(1, 'B', 'EASY');
    await b.review(2, 'C', 'HARD');
    await a.repos.sync.bind('alice');
    await b.repos.sync.bind('alice');
    synced(await a.sync());
    const fromB = synced(await b.sync());
    expect(fromB.pulled).toBe(2);
    expect(fromB.pushed).toBe(2);
    synced(await a.sync());
    await expectConverged(a, b);
    expect((await a.data()).reviewLogs).toHaveLength(4);
    expect(cloud.logsOf('alice')).toHaveLength(4);
  });

  it('the order of syncing does not change the result', async () => {
    const run = async (aFirst: boolean) => {
      clock = 1_800_000_000_000;
      const cloud = new MemoryCloud();
      const a = await device(cloud, () => 'u');
      const b = await device(cloud, () => 'u');
      await a.review(0, 'A', 'GOOD');
      await b.review(0, 'A', 'HARD');
      await a.review(0, 'A', 'EASY');
      await b.review(3, 'D', 'AGAIN');
      for (const d of [a, b]) await d.repos.sync.bind('u');
      const order = aFirst ? [a, b, a] : [b, a, b];
      for (const d of order) synced(await d.sync());
      await expectConverged(a, b);
      return (await a.data()).reviewCards;
    };
    expect(await run(true)).toEqual(await run(false));
  });

  it('sending again never duplicates: a push whose ledger write was lost is recognised on the next sync', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'u');
    await a.repos.sync.bind('u');
    await a.review(0, 'A', 'GOOD');
    const markUploaded = a.repos.sync.markUploaded.bind(a.repos.sync);
    let lose = true;
    a.repos.sync.markUploaded = async (ids, epoch) => {
      if (lose) {
        lose = false;
        throw new Error('tab closed before the ledger was written');
      }
      return markUploaded(ids, epoch);
    };
    await expect(a.sync()).rejects.toThrow('tab closed');
    expect(cloud.logsOf('u')).toHaveLength(1);
    const again = synced(await a.sync()); // the pull sees its own log: ledger entry, nothing pushed twice
    expect(again.pushed).toBe(0);
    expect(cloud.logsOf('u')).toHaveLength(1);
    expect(cloud.ops.logWrites).toBe(1);
    expect(await a.repos.sync.pendingLogs()).toEqual([]);
  });

  it('legacy ids that collide (same id, different reviews) are both kept: the local one is renamed, then uploaded', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'u');
    const b = await device(cloud, () => 'u');
    const cardId = `kanji:kanji:${KANJI[0]!}:A`;
    const legacy = (rating: ReviewRating, at: number): ReviewLog => ({ id: `${cardId}#1`, cardId, rating, reviewedAt: at, durationMs: 1, stateBefore: 'NEW', stateAfter: 'LEARNING', datasetVersion: null, deviceId: null, originalId: null });
    await a.repos.backup.replaceUserData({ reviewCards: [], reviewLogs: [legacy('GOOD', 1_700_000_000_000)], studySessions: [], userSettings: null });
    await b.repos.backup.replaceUserData({ reviewCards: [], reviewLogs: [legacy('AGAIN', 1_700_000_100_000)], studySessions: [], userSettings: null });
    for (const d of [a, b]) await d.repos.sync.bind('u');
    synced(await a.sync());
    const fromB = synced(await b.sync());
    expect(fromB.renamed).toBe(1);
    synced(await a.sync());
    await expectConverged(a, b);
    const ids = cloud.logsOf('u').map((l) => [l.id.replace(/~[0-9a-f]+$/, '~<hash>'), l.originalId, l.rating]);
    expect(ids).toEqual([
      [`${cardId}#1`, null, 'GOOD'],
      [`${cardId}#1~<hash>`, `${cardId}#1`, 'AGAIN'],
    ]);
  });

  it('D6: after a reset on A, device B (not yet aware) uploads NOTHING and asks; its unsynced reviews stay local', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'u');
    const b = await device(cloud, () => 'u');
    for (const d of [a, b]) await d.repos.sync.bind('u');
    await a.review(0, 'A', 'GOOD');
    synced(await a.sync());
    synced(await b.sync());
    await b.review(1, 'A', 'GOOD'); // offline review on B, before it learns about the reset

    await a.repos.backup.resetProgress();
    const replaced = synced(await a.sync());
    expect(replaced.replaced).toBe(true);
    expect(cloud.logsOf('u')).toEqual([]); // old epoch deleted
    await a.review(2, 'A', 'EASY');
    synced(await a.sync());

    const pushesBefore = cloud.ops.pushes;
    const outcome = await b.sync();
    expect(outcome).toMatchObject({ kind: 'remote-reset', epoch: 1, unsynced: 1 });
    expect(cloud.ops.pushes).toBe(pushesBefore); // not even attempted
    expect(cloud.logsOf('u').map((l) => l.cardId)).toEqual([`kanji:kanji:${KANJI[2]!}:A`]);
    expect((await b.data()).reviewLogs).toHaveLength(2); // nothing deleted without the user

    await b.repos.sync.acceptRemoteReset(1);
    synced(await b.sync());
    await expectConverged(a, b);
    expect(cloud.epochsOf('u')).toEqual([1]);
  });

  it('a stale device cannot bring old data back even if it ignores the check: the cloud refuses the old epoch', async () => {
    const cloud = new MemoryCloud();
    const b = await device(cloud, () => 'u');
    await b.repos.sync.bind('u');
    synced(await b.sync());
    cloud.account('u').root = { epoch: 5, resetAt: 1 };
    await b.review(0, 'A', 'GOOD');
    await expect(cloud.as(() => 'u').pushLogs('u', 0, await b.repos.sync.pendingLogs())).rejects.toMatchObject({ kind: 'denied' });
    expect(cloud.logsOf('u')).toEqual([]);
  });

  it('Import (Replace) while bound: the cloud becomes exactly the imported data (new epoch), other devices are asked', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'u');
    const b = await device(cloud, () => 'u');
    for (const d of [a, b]) await d.repos.sync.bind('u');
    await a.review(0, 'A', 'GOOD');
    synced(await a.sync());
    synced(await b.sync());
    const imported = (await b.data()).reviewLogs.map((l) => ({ ...l, rating: 'EASY' as const, id: `${l.id}-file` }));
    await a.repos.backup.replaceUserData({ reviewCards: [...replayAll(imported).values()], reviewLogs: imported, studySessions: [], userSettings: { ...DEFAULT_USER_SETTINGS, dailyNewCards: 30, updatedAt: 1 } });
    const out = synced(await a.sync());
    expect(out.replaced).toBe(true);
    expect(out.settings).toBe('uploaded'); // the imported settings win once, despite their old updatedAt
    expect(cloud.logsOf('u')).toEqual(imported);
    expect(cloud.account('u').settings?.dailyNewCards).toBe(30);
    expect((await b.sync()).kind).toBe('remote-reset');
    // importing the same file again: one more epoch, still exactly that data
    await a.repos.backup.replaceUserData({ reviewCards: [...replayAll(imported).values()], reviewLogs: imported, studySessions: [], userSettings: null });
    synced(await a.sync());
    expect(cloud.logsOf('u')).toEqual(imported);
    expect(cloud.epochsOf('u')).toEqual([2]);
  });

  it('D-L3-8: progress on an unbound device is not uploaded until the user agrees', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'u');
    await a.review(0, 'A', 'GOOD');
    expect(await a.sync()).toEqual({ kind: 'needs-binding', reason: 'unbound', uid: 'u' });
    expect(cloud.ops.pushes).toBe(0);
    await a.repos.sync.bind('u');
    expect(synced(await a.sync()).pushed).toBe(1);
  });

  it('a device without progress binds silently', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'u');
    expect((await a.sync()).kind).toBe('synced');
    expect((await a.repos.sync.getMeta()).uid).toBe('u');
  });

  it("never uploads account A's progress into account B", async () => {
    const cloud = new MemoryCloud();
    let who = 'alice';
    const d = await device(cloud, () => who);
    await d.repos.sync.bind('alice');
    await d.review(0, 'A', 'GOOD');
    synced(await d.sync());
    await d.review(1, 'A', 'GOOD');
    who = 'bob';
    expect(await d.sync()).toEqual({ kind: 'needs-binding', reason: 'other-account', uid: 'bob' });
    expect(cloud.logsOf('bob')).toEqual([]);
    expect(cloud.logsOf('alice')).toHaveLength(1);
  });

  it('a declined account is not synced', async () => {
    const cloud = new MemoryCloud();
    const d = await device(cloud, () => 'u');
    await d.review(0, 'A', 'GOOD');
    await d.repos.sync.updateMeta({ declinedUid: 'u' });
    expect(await d.sync()).toEqual({ kind: 'declined', uid: 'u' });
    expect(cloud.ops.pushes).toBe(0);
  });

  it('signed out (no Firebase user): nothing at all', async () => {
    const cloud = new MemoryCloud();
    const d = await device(cloud, () => null);
    expect(await d.sync()).toEqual({ kind: 'no-user' });
  });

  it('settings: the newer updatedAt wins; equal keeps this device; downloaded settings keep their own updatedAt', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'u');
    const b = await device(cloud, () => 'u');
    clock += 1;
    await a.repos.settings.save({ ...DEFAULT_USER_SETTINGS, theme: 'dark' }); // stamped with Date.now()
    expect(synced(await a.sync()).settings).toBe('uploaded');
    expect(synced(await b.sync()).settings).toBe('downloaded');
    expect(await b.repos.sync.getSettings()).toEqual(cloud.account('u').settings);
    expect(synced(await b.sync()).settings).toBe('kept');
  });

  it('many reviews are uploaded in batches of PUSH_BATCH and pulled in pages', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'u');
    const b = await device(cloud, () => 'u');
    await a.repos.sync.bind('u');
    const n = PUSH_BATCH * 3 + 7;
    for (let i = 0; i < n; i += 1) await a.review(i % KANJI.length, (['A', 'B', 'C', 'D'] as const)[i % 4]!, (['AGAIN', 'HARD', 'GOOD', 'EASY'] as const)[i % 4]!);
    expect(synced(await a.sync()).pushed).toBe(n);
    expect(cloud.ops.pushes).toBe(4);
    expect(synced(await b.sync()).pulled).toBe(n);
    await expectConverged(a, b);
  });

  it('a failure in the middle keeps what was done; the next sync continues', async () => {
    const cloud = new MemoryCloud();
    const a = await device(cloud, () => 'u');
    await a.repos.sync.bind('u');
    for (let i = 0; i < PUSH_BATCH + 3; i += 1) await a.review(i % KANJI.length, 'A', 'GOOD');
    let calls = 0;
    const store = cloud.as(() => 'u');
    const flaky = { ...store, pushLogs: (uid: string, e: number, logs: readonly ReviewLog[]) => (++calls === 2 ? Promise.reject(new CloudError('network', 'dropped')) : store.pushLogs(uid, e, logs)) };
    await expect(runSyncCycle({ repo: a.repos.sync, cloud: flaky, now: () => clock })).rejects.toMatchObject({ kind: 'network' });
    expect(cloud.logsOf('u')).toHaveLength(PUSH_BATCH);
    expect(await a.repos.sync.pendingLogs()).toHaveLength(3);
    expect(synced(await a.sync()).pushed).toBe(3);
  });
});
