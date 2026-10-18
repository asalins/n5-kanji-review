import { afterEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepositories } from '../../../src/repositories/indexeddb';
import { CloudError } from '../../../src/services/sync/cloudTypes';
import { BACKOFF_MS, CHANGE_DEBOUNCE_MS, CYCLE_TIMEOUT_MS, QUOTA_PAUSE_MS, createSyncService, type LockManagerLike, type SyncEnvironment } from '../../../src/services/sync/syncService';
import { sampleRecords } from '../../helpers/backupFixtures';
import { MemoryCloud } from '../../helpers/memoryCloud';
import { openTestDatabase } from '../../helpers/testDatabase';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of disposers.splice(0)) await d();
});
const settle = () => new Promise((r) => setTimeout(r, 20));

class Env implements SyncEnvironment {
  online = true;
  time = 1_000;
  timers = new Map<number, { fn: () => void; ms: number }>();
  private n = 0;
  private onlineL: (() => void)[] = [];
  private offlineL: (() => void)[] = [];
  private hiddenL: (() => void)[] = [];
  locks: LockManagerLike | null = null;
  isOnline = () => this.online;
  onOnline = (l: () => void) => (this.onlineL.push(l), () => undefined);
  onOffline = (l: () => void) => (this.offlineL.push(l), () => undefined);
  onHidden = (l: () => void) => (this.hiddenL.push(l), () => undefined);
  setTimer = (fn: () => void, ms: number) => (this.timers.set(++this.n, { fn, ms }), this.n);
  clearTimer = (h: unknown) => void this.timers.delete(h as number);
  now = () => this.time;
  delays = () => [...this.timers.values()].map((t) => t.ms);
  fire() {
    const all = [...this.timers.values()];
    this.timers.clear();
    for (const t of all) t.fn();
  }
  /** Fires only the timers of this delay (e.g. the F8 cycle timeout, not a back-off). */
  fireDelay(ms: number) {
    for (const [id, t] of [...this.timers]) if (t.ms === ms) (this.timers.delete(id), t.fn());
  }
  goOffline() {
    this.online = false;
    for (const l of this.offlineL) l();
  }
  goOnline() {
    this.online = true;
    for (const l of this.onlineL) l();
  }
  hide() {
    for (const l of this.hiddenL) l();
  }
}

async function setup(options: { bound?: boolean; progress?: boolean; log?: string[] } = {}) {
  const { db, dispose } = await openTestDatabase();
  disposers.push(dispose);
  const repos = createIndexedDbRepositories(db);
  if (options.progress === true) await repos.backup.replaceUserData({ reviewCards: [], reviewLogs: sampleRecords().logs, studySessions: [], userSettings: null });
  if (options.bound !== false) await repos.sync.bind('u');
  const cloud = new MemoryCloud();
  const env = new Env();
  let loaded = true;
  const changes: unknown[] = [];
  const log = options.log;
  const syncLog = log === undefined ? undefined : { add: (e: string) => void log.push(e), list: () => [], subscribe: () => () => undefined };
  const service = createSyncService({ repo: repos.sync, getCloud: () => (loaded ? cloud.as(() => 'u') : null), env, ...(syncLog === undefined ? {} : { syncLog }) });
  service.subscribeDataChanged((c) => changes.push(c));
  return { repos, cloud, env, service, changes, unload: () => (loaded = false) };
}

describe('sync scheduler', () => {
  it('off until active; active -> syncs at once', async () => {
    const { service, cloud } = await setup({ progress: true });
    expect(service.getStatus()).toEqual({ kind: 'off' });
    service.setActive(true);
    await expect.poll(() => service.getStatus().kind).toBe('idle');
    expect(cloud.logsOf('u')).toHaveLength(sampleRecords().logs.length);
  });

  it(`a local change is uploaded after ${CHANGE_DEBOUNCE_MS / 1000} s (debounced), or at once when the page is hidden`, async () => {
    const { service, env } = await setup();
    service.setActive(true);
    await settle();
    service.notifyLocalChange();
    service.notifyLocalChange();
    expect(env.delays()).toEqual([CHANGE_DEBOUNCE_MS]);
    env.hide();
    await settle(); // (the cycle's own F8 timeout timer exists only while it runs)
    expect(env.delays()).toEqual([]); // sent now instead of waiting
  });

  it(`errors back off ${BACKOFF_MS.map((m) => m / 1000).join(' -> ')} s; success resets`, async () => {
    const { service, env, cloud } = await setup();
    cloud.failure = new CloudError('unknown', 'server error');
    service.setActive(true);
    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      await settle();
      seen.push(...env.delays());
      env.fire();
    }
    expect(seen).toEqual([...BACKOFF_MS, BACKOFF_MS.at(-1)!]);
    await settle();
    cloud.failure = null;
    env.fire();
    await settle();
    expect(service.getStatus().kind).toBe('idle');
  });

  it('F6: hiding the page during a back-off does NOT retry (tab switches must not escalate the back-off)', async () => {
    const { service, env, cloud } = await setup();
    cloud.failure = new CloudError('denied', 'permission-denied');
    service.setActive(true);
    await settle();
    expect(env.delays()).toEqual([BACKOFF_MS[0]]);
    const pullsBefore = cloud.ops.pulls;
    for (let i = 0; i < 5; i += 1) env.hide();
    await settle();
    expect(cloud.ops.pulls).toBe(pullsBefore); // no extra attempt
    expect(env.delays()).toEqual([BACKOFF_MS[0]]); // still the first back-off step
  });

  it('quota exhausted -> "paused" for an hour; local data untouched', async () => {
    const { service, env, cloud, repos } = await setup({ progress: true });
    cloud.failure = new CloudError('quota', 'resource-exhausted');
    service.setActive(true);
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'paused-quota', retryAt: env.time + QUOTA_PAUSE_MS });
    expect(env.delays()).toEqual([QUOTA_PAUSE_MS]);
    expect(await repos.sync.hasLocalProgress()).toBe(true);
  });

  it('offline: nothing is attempted; back online -> syncs', async () => {
    const { service, env, cloud } = await setup({ progress: true });
    env.online = false;
    service.setActive(true);
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'offline' });
    expect(cloud.ops.pulls).toBe(0);
    env.goOnline();
    await settle();
    expect(service.getStatus().kind).toBe('idle');
  });

  it('another tab holds the lock: this tab skips (one sync at a time)', async () => {
    const { service, env, cloud } = await setup({ progress: true });
    let held = true;
    env.locks = { request: async (_n, _o, cb) => cb(held ? null : {}) };
    service.setActive(true);
    await settle();
    expect(cloud.ops.pulls).toBe(0);
    held = false;
    await service.syncNow();
    expect(cloud.ops.pulls).toBeGreaterThan(0);
  });

  it('binding prompt: upload / replace-local / skip', async () => {
    const a = await setup({ bound: false, progress: true });
    a.service.setActive(true);
    await settle();
    expect(a.service.getStatus()).toEqual({ kind: 'needs-binding', reason: 'unbound' });
    await a.service.resolveBinding('upload');
    expect(a.cloud.logsOf('u')).toHaveLength(sampleRecords().logs.length);

    const b = await setup({ bound: false, progress: true });
    b.service.setActive(true);
    await settle();
    await b.service.resolveBinding('replace-local');
    expect(await b.repos.sync.hasLocalProgress()).toBe(false);
    expect(b.cloud.logsOf('u')).toEqual([]);
    expect(b.changes).toContainEqual({ cards: true, settings: false });

    const c = await setup({ bound: false, progress: true });
    c.service.setActive(true);
    await settle();
    await c.service.resolveBinding('skip');
    expect(c.service.getStatus()).toEqual({ kind: 'declined' });
    expect(c.cloud.ops.pushes).toBe(0);
    await c.service.enable();
    expect(c.service.getStatus()).toEqual({ kind: 'needs-binding', reason: 'unbound' });
  });

  it('remote reset: waits for the user, then clears local progress and follows the new epoch', async () => {
    const { service, cloud, repos } = await setup({ progress: true });
    service.setActive(true);
    await settle();
    cloud.account('u').root = { epoch: 1, resetAt: 99 };
    await service.syncNow();
    expect(service.getStatus()).toMatchObject({ kind: 'remote-reset', epoch: 1, resetAt: 99 });
    expect(await repos.sync.hasLocalProgress()).toBe(true);
    await service.acceptRemoteReset();
    expect(await repos.sync.hasLocalProgress()).toBe(false);
    expect(service.getStatus().kind).toBe('idle');
  });

  it('Delete Account: no sync runs while the cloud data is deleted; afterwards nothing is re-created', async () => {
    const { service, cloud, env } = await setup({ progress: true });
    service.setActive(true);
    await settle();
    expect(await service.deleteCloudData('u')).toBe('deleted');
    service.notifyLocalChange();
    await service.syncNow();
    env.fire();
    await settle();
    expect(cloud.logsOf('u')).toEqual([]);
    expect(cloud.account('u').root).toBeNull();
  });

  it('cloud deletion failing is reported (the account service then stops before deleting the account)', async () => {
    const { service, cloud } = await setup();
    service.setActive(true);
    await settle();
    cloud.failure = new CloudError('network', 'offline');
    expect(await service.deleteCloudData('u')).toBe('failed');
  });

  it('signed out (SDK not loaded) -> off', async () => {
    const { service, unload } = await setup();
    unload();
    service.setActive(true);
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'off' });
  });
});

describe('F8: offline / timed-out sync never shows "Syncing…" forever, and nothing is sent twice', () => {
  const N = sampleRecords().logs.length;

  it('going offline during a cycle shows "offline" at once; the late result does not overwrite it; online -> one fresh sync', async () => {
    const { service, env, cloud } = await setup({ progress: true });
    const held = cloud.hold('pushLogs', 'before');
    service.setActive(true);
    await settle();
    expect(service.getStatus().kind).toBe('syncing');
    env.goOffline();
    expect(service.getStatus()).toEqual({ kind: 'offline' });
    held.release(); // the request reaches the cloud later
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'offline' }); // the stale cycle's "idle" is ignored
    expect(cloud.logsOf('u')).toHaveLength(N);
    env.goOnline();
    await expect.poll(() => service.getStatus().kind).toBe('idle');
    expect(cloud.ops.logWrites).toBe(N); // written once
  });

  it(`stuck BEFORE reaching the cloud: after ${CYCLE_TIMEOUT_MS / 1000} s -> network error + back-off; no second cycle while it waits`, async () => {
    const log: string[] = [];
    const { service, env, cloud } = await setup({ progress: true, log });
    const held = cloud.hold('pushLogs', 'before');
    service.setActive(true);
    await settle();
    env.fireDelay(CYCLE_TIMEOUT_MS);
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'error', reason: 'network', retryAt: env.time + BACKOFF_MS[0] });
    expect(log).toContain('sync timed out after 30 s: still waiting for the network; nothing is sent twice');
    env.fireDelay(BACKOFF_MS[0]); // the retry comes while the first request still waits
    await settle();
    expect(cloud.ops.pushes).toBe(0); // no concurrent cycle
    held.release();
    await expect.poll(() => service.getStatus().kind).toBe('idle'); // the queued fresh cycle
    expect(cloud.logsOf('u')).toHaveLength(N);
    expect(cloud.ops.logWrites).toBe(N);
    expect(log.some((e) => e.startsWith('late result of the timed-out sync: synced'))).toBe(true);
  });

  it('cloud wrote it but the ANSWER is late: the fresh cycle finds it uploaded (no duplicate, no denied retry storm, epoch unchanged)', async () => {
    const { service, env, cloud, repos } = await setup({ progress: true });
    const held = cloud.hold('pushLogs', 'after');
    service.setActive(true);
    await settle();
    expect(cloud.logsOf('u')).toHaveLength(N); // already on the server
    env.fireDelay(CYCLE_TIMEOUT_MS);
    await settle();
    expect(service.getStatus().kind).toBe('error');
    held.release();
    await settle();
    expect(service.getStatus().kind).toBe('error'); // late "synced" does not overwrite
    await service.syncNow();
    await expect.poll(() => service.getStatus().kind).toBe('idle');
    expect(cloud.ops.logWrites).toBe(N);
    expect(await repos.sync.pendingLogs()).toEqual([]);
    expect(cloud.account('u').root?.epoch).toBe(0);
    expect(cloud.bumps).toEqual([]);
  });

  it('late answer AND the device fails to record it: the next cycle is refused (create-only), pulls, marks — never written twice', async () => {
    const { service, env, cloud, repos } = await setup({ progress: true });
    const held = cloud.hold('pushLogs', 'after');
    service.setActive(true);
    await settle();
    env.fireDelay(CYCLE_TIMEOUT_MS);
    await settle();
    const real = repos.sync.markUploaded.bind(repos.sync);
    let lose = true;
    repos.sync.markUploaded = async (ids, epoch) => {
      if (lose) {
        lose = false;
        throw new Error('tab closed');
      }
      return real(ids, epoch);
    };
    held.release();
    await settle();
    expect((await repos.sync.pendingLogs()).length).toBe(N); // not recorded locally
    await service.syncNow();
    await expect.poll(() => service.getStatus().kind).toBe('idle');
    expect(cloud.ops.logWrites).toBe(N);
    expect(new Set(cloud.logsOf('u').map((l) => l.id)).size).toBe(N);
    expect(await repos.sync.pendingLogs()).toEqual([]);
  });

  it('Reset / Import while a sync still waits for the network: refused after the timeout, nothing changed, no epoch raise', async () => {
    const { service, env, cloud, repos } = await setup({ progress: true });
    service.setActive(true);
    await expect.poll(() => service.getStatus().kind).toBe('idle');
    await repos.sync.updateMeta({}); // bound and synced at epoch 0
    const held = cloud.hold('pullLogs', 'before');
    void service.syncNow();
    await settle();
    let wrote = false;
    const replacing = service.replaceAccount('Reset progress', async () => {
      wrote = true;
    });
    await settle();
    env.fireDelay(CYCLE_TIMEOUT_MS);
    await expect(replacing).rejects.toMatchObject({ code: 'cloud-failed' });
    expect(wrote).toBe(false);
    expect(cloud.bumps).toEqual([]);
    expect(cloud.account('u').root?.epoch).toBe(0);
    held.release();
    await settle();
  });

  it('the back-off and quota policies are unchanged by the timeout (F6 still holds)', async () => {
    const { service, env, cloud } = await setup();
    cloud.failure = new CloudError('quota', 'resource-exhausted');
    service.setActive(true);
    await settle();
    expect(env.delays()).toEqual([QUOTA_PAUSE_MS]); // no timeout timer left behind
  });
});

