import { afterEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepositories } from '../../../src/repositories/indexeddb';
import { CloudError } from '../../../src/services/sync/cloudTypes';
import { BACKOFF_MS, CHANGE_DEBOUNCE_MS, QUOTA_PAUSE_MS, createSyncService, type LockManagerLike, type SyncEnvironment } from '../../../src/services/sync/syncService';
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
  private hiddenL: (() => void)[] = [];
  locks: LockManagerLike | null = null;
  isOnline = () => this.online;
  onOnline = (l: () => void) => (this.onlineL.push(l), () => undefined);
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
  goOnline() {
    this.online = true;
    for (const l of this.onlineL) l();
  }
  hide() {
    for (const l of this.hiddenL) l();
  }
}

async function setup(options: { bound?: boolean; progress?: boolean } = {}) {
  const { db, dispose } = await openTestDatabase();
  disposers.push(dispose);
  const repos = createIndexedDbRepositories(db);
  if (options.progress === true) await repos.backup.replaceUserData({ reviewCards: [], reviewLogs: sampleRecords().logs, studySessions: [], userSettings: null });
  if (options.bound !== false) await repos.sync.bind('u');
  const cloud = new MemoryCloud();
  const env = new Env();
  let loaded = true;
  const changes: unknown[] = [];
  const service = createSyncService({ repo: repos.sync, getCloud: () => (loaded ? cloud.as(() => 'u') : null), env });
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
