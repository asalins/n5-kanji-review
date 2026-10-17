import type { SyncRepository } from '../../repositories/interfaces';
import { CloudError, type CloudStore } from './cloudTypes';
import { runSyncCycle, type SyncOutcome } from './syncEngine';
import { createSyncLog, type SyncLog } from './syncLog';

/**
 * L3b sync scheduler. When to sync, never what (that is syncEngine):
 *  - after the account is confirmed by the server, after a review (30 s debounce), on `online`, when the page
 *    is hidden, and on "Sync now";
 *  - one sync at a time across tabs and the installed app (Web Locks, `n5-sync`);
 *  - failures back off 30 s -> 2 min -> 10 min -> 1 h; quota (resource-exhausted) pauses for 1 h;
 *  - offline: nothing is attempted; local study is never blocked or changed by sync.
 */

export type SyncStatus =
  | { readonly kind: 'off' }
  | { readonly kind: 'idle'; readonly lastSyncAt: number | null }
  | { readonly kind: 'syncing' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'needs-binding'; readonly reason: 'unbound' | 'other-account' }
  | { readonly kind: 'declined' }
  | { readonly kind: 'remote-reset'; readonly epoch: number; readonly resetAt: number | null; readonly unsynced: number }
  | { readonly kind: 'paused-quota'; readonly retryAt: number }
  | { readonly kind: 'error'; readonly retryAt: number; readonly reason: 'network' | 'auth' | 'denied' | 'unknown' };

export type BindingChoice = 'upload' | 'replace-local' | 'skip';

export const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000] as const;
export const QUOTA_PAUSE_MS = 3_600_000;
export const CHANGE_DEBOUNCE_MS = 30_000;
const LOCK_NAME = 'n5-sync';

export interface LockManagerLike {
  request<T>(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<T>): Promise<T>;
}

export interface SyncEnvironment {
  isOnline(): boolean;
  onOnline(listener: () => void): () => void;
  onHidden(listener: () => void): () => void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  now(): number;
  /** null = Web Locks unsupported: this tab syncs without cross-tab exclusion. */
  locks: LockManagerLike | null;
}

export interface SyncServiceDeps {
  readonly repo: SyncRepository;
  /** The cloud of the currently loaded account adapter; null while the SDK is not loaded (signed out). */
  readonly getCloud: () => CloudStore | null;
  readonly env: SyncEnvironment;
  readonly logError?: (error: unknown) => void;
  /** F5: local diagnostic log (default: in memory only). */
  readonly syncLog?: SyncLog;
}

export interface DataChange {
  readonly cards: boolean;
  readonly settings: boolean;
}

export interface SyncService {
  getStatus(): SyncStatus;
  subscribe(listener: () => void): () => void;
  /** Learning data or settings on this device were changed by a sync (screens reload what they show). */
  subscribeDataChanged(listener: (change: DataChange) => void): () => void;
  /** The account became server-confirmed (or changed): start syncing. Signed out: stop. */
  setActive(active: boolean): void;
  /** A review / settings change was stored locally. */
  notifyLocalChange(): void;
  syncNow(): Promise<void>;
  resolveBinding(choice: BindingChoice): Promise<void>;
  /** The user confirmed the reset made on another device (after exporting a backup if they wanted). */
  acceptRemoteReset(): Promise<void>;
  /** Turn sync back on for an account this device had declined. */
  enable(): Promise<void>;
  /** Delete Account: waits for a running sync, blocks new ones, deletes every cloud document of `uid`. */
  deleteCloudData(uid: string): Promise<'deleted' | 'failed'>;
  /** After a failed Delete Account: syncing may continue. */
  resume(): void;
  /** Is this device's progress bound to an account (Reset / Import then also replace that account's cloud data)? */
  isBound(): Promise<boolean>;
  /** F5: what sync decided on this device, newest last. */
  readonly log: SyncLog;
}

const errorReason = (error: unknown): 'network' | 'auth' | 'denied' | 'unknown' | 'quota' => {
  if (error instanceof CloudError) {
    if (error.kind === 'conflict') return 'unknown';
    return error.kind;
  }
  return 'unknown';
};

export function createSyncService(deps: SyncServiceDeps): SyncService {
  const { repo, env } = deps;
  const log = deps.logError ?? (() => undefined);
  const syncLog = deps.syncLog ?? createSyncLog(null);
  const note = (event: string) => syncLog.add(event);
  let status: SyncStatus = { kind: 'off' };
  let active = false;
  let suspended = false;
  let running: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let timer: unknown = null;
  let remoteResetEpoch: number | null = null;
  const listeners = new Set<() => void>();
  const dataListeners = new Set<(change: DataChange) => void>();
  const dataChanged = (change: DataChange) => {
    for (const listener of dataListeners) listener(change);
  };

  const set = (next: SyncStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };

  const schedule = (ms: number) => {
    if (timer !== null) env.clearTimer(timer);
    timer = env.setTimer(() => {
      timer = null;
      void run();
    }, ms);
  };
  const cancelTimer = () => {
    if (timer !== null) env.clearTimer(timer);
    timer = null;
  };

  async function cycle(): Promise<void> {
    const cloud = deps.getCloud();
    if (cloud === null) {
      set({ kind: 'off' });
      return;
    }
    set({ kind: 'syncing' });
    let outcome: SyncOutcome;
    try {
      outcome = await runSyncCycle({ repo, cloud, now: env.now, log: note });
    } catch (error) {
      const reason = errorReason(error);
      if (reason === 'unknown') log(error);
      note(`sync failed: ${reason}${env.isOnline() ? '' : ' (offline)'}`);
      if (!env.isOnline()) {
        failures = 0;
        set({ kind: 'offline' }); // retried on `online`
        return;
      }
      if (reason === 'quota') {
        set({ kind: 'paused-quota', retryAt: env.now() + QUOTA_PAUSE_MS });
        schedule(QUOTA_PAUSE_MS);
        return;
      }
      const wait = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!;
      failures += 1;
      set({ kind: 'error', reason, retryAt: env.now() + wait });
      schedule(wait);
      return;
    }
    failures = 0;
    switch (outcome.kind) {
      case 'no-user':
        set({ kind: 'off' });
        return;
      case 'needs-binding':
        if (status.kind !== 'needs-binding') note(`asking before binding (${outcome.reason}); nothing uploaded`);
        set({ kind: 'needs-binding', reason: outcome.reason });
        return;
      case 'declined':
        set({ kind: 'declined' });
        return;
      case 'remote-reset':
        remoteResetEpoch = outcome.epoch;
        set({ kind: 'remote-reset', epoch: outcome.epoch, resetAt: outcome.resetAt, unsynced: outcome.unsynced });
        return;
      case 'synced': {
        const cards = outcome.pulled > 0 || outcome.renamed > 0 || outcome.cardsUpdated > 0;
        const settings = outcome.settings === 'downloaded';
        if (cards || settings) dataChanged({ cards, settings });
        set({ kind: 'idle', lastSyncAt: (await repo.getMeta()).lastSyncAt });
      }
    }
  }

  /** Runs one cycle (holding the cross-tab lock); a request during a run causes exactly one more run. */
  function run(): Promise<void> {
    if (!active || suspended) return Promise.resolve();
    if (!env.isOnline()) {
      set({ kind: 'offline' });
      return Promise.resolve();
    }
    if (running !== null) {
      again = true;
      return running;
    }
    cancelTimer();
    const once = async () => {
      if (env.locks === null) return cycle();
      // Another tab / the installed app is syncing: skip; it is doing the same work on the same data.
      await env.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (lock !== null) await cycle();
      });
    };
    running = (async () => {
      try {
        do {
          again = false;
          await once();
        } while (again && active && !suspended);
      } catch (error) {
        log(error);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  let started = false;
  const startListeners = () => {
    if (started) return;
    started = true;
    env.onOnline(() => {
      if (active) {
        failures = 0;
        void run();
      }
    });
    env.onHidden(() => {
      if (active && timer !== null) void run(); // a debounced upload is waiting: send it before the page may be closed
    });
  };

  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeDataChanged(listener) {
      dataListeners.add(listener);
      return () => dataListeners.delete(listener);
    },
    setActive(next) {
      active = next;
      if (!next) {
        cancelTimer();
        set({ kind: 'off' });
        return;
      }
      startListeners();
      failures = 0;
      void run();
    },
    notifyLocalChange() {
      if (!active || suspended) return;
      if (status.kind === 'paused-quota' || status.kind === 'error') return; // its retry timer will pick it up
      schedule(CHANGE_DEBOUNCE_MS);
    },
    syncNow() {
      failures = 0;
      return run();
    },
    async resolveBinding(choice) {
      const cloud = deps.getCloud();
      const uid = cloud === null ? null : await cloud.confirmedUid().catch(() => null);
      if (uid === null) return;
      note(`binding answered by the user: ${choice}`);
      if (choice === 'skip') {
        await repo.updateMeta({ declinedUid: uid });
        set({ kind: 'declined' });
        return;
      }
      if (choice === 'replace-local') await repo.forgetLocalProgress();
      await repo.bind(uid);
      dataChanged({ cards: choice === 'replace-local', settings: false });
      await run();
    },
    async acceptRemoteReset() {
      if (remoteResetEpoch === null) return;
      note(`user accepted the remote reset: local progress cleared, following epoch ${remoteResetEpoch}`);
      await repo.acceptRemoteReset(remoteResetEpoch);
      remoteResetEpoch = null;
      dataChanged({ cards: true, settings: false });
      await run();
    },
    async enable() {
      note('sync turned back on by the user');
      await repo.updateMeta({ declinedUid: null });
      await run();
    },
    async deleteCloudData(uid) {
      suspended = true;
      cancelTimer();
      if (running !== null) await running;
      const cloud = deps.getCloud();
      if (cloud === null) return 'failed';
      const task = async () => {
        try {
          await cloud.deleteAll(uid);
          note('Delete Account: cloud data deleted');
          return 'deleted' as const;
        } catch (error) {
          log(error);
          note('Delete Account: deleting the cloud data FAILED (account kept)');
          return 'failed' as const;
        }
      };
      // Hold the cross-tab lock so no other tab uploads while the documents are being deleted.
      return env.locks === null ? task() : env.locks.request(LOCK_NAME, { ifAvailable: false }, task);
    },
    resume() {
      suspended = false;
    },
    isBound: async () => (await repo.getMeta()).uid !== null,
    log: syncLog,
  };
}

export const browserSyncEnvironment = (): SyncEnvironment => ({
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  onOnline(listener) {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
  onHidden(listener) {
    if (typeof document === 'undefined') return () => undefined;
    const handler = () => {
      if (document.visibilityState === 'hidden') listener();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  locks: typeof navigator !== 'undefined' && 'locks' in navigator ? (navigator.locks as unknown as LockManagerLike) : null,
});
