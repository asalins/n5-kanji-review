import type { SyncRepository } from '../../repositories/interfaces';
import { CloudError, type CloudStore } from './cloudTypes';
import { runSyncCycle, type SyncOutcome } from './syncEngine';
import { createSyncLog, type SyncLog, type SyncLogAddOptions } from './syncLog';
import { ReplaceError } from './replaceErrors';
import type { AccountReplace } from '../../repositories/interfaces';
import { newUuid } from '../../utils/uuid';

/**
 * L3b sync scheduler. When to sync, never what (that is syncEngine):
 *  - after the account is confirmed by the server, after a review (30 s debounce), on `online`, when the page
 *    is hidden, and on "Sync now";
 *  - one sync at a time across tabs and the installed app (Web Locks, `n5-sync`);
 *  - failures back off 30 s -> 2 min -> 10 min -> 1 h; quota (resource-exhausted) pauses for 1 h;
 *  - offline: nothing is attempted; local study is never blocked or changed by sync.
 *  - F8: going offline shows "offline" at once; a cycle still waiting after CYCLE_TIMEOUT_MS is reported as offline /
 *    network error (back-off as before). Its request cannot be cancelled, so the cycle keeps the lock until it
 *    settles (never two cycles at once: nothing is sent twice) and its late result never overwrites a newer status.
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
export const CYCLE_TIMEOUT_MS = 30_000;
const LOCK_NAME = 'n5-sync';

export interface LockManagerLike {
  request<T>(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<T>): Promise<T>;
}

export interface SyncEnvironment {
  isOnline(): boolean;
  onOnline(listener: () => void): () => void;
  /** F8: the browser went offline (optional: environments without it only learn on the next attempt). */
  onOffline?(listener: () => void): () => void;
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
  /**
   * L4-C1 (F2): Reset progress / Import (Replace) on a bound device. Order (Firestore and IndexedDB cannot commit
   * together): (1) online + server-confirmed same account + this device has synced; (2) ONE Firestore transaction
   * raises the epoch only if it is still this device's known epoch (else 'conflict': nothing changed anywhere);
   * (3) `writeLocal` replaces the local data and follows the new epoch in ONE IndexedDB transaction; (4) the next
   * sync deletes the old-epoch cloud logs and uploads. Syncing is suspended and the cross-tab lock held throughout.
   * Throws ReplaceError; never reports success unless (2) and (3) both committed.
   */
  replaceAccount(what: string, writeLocal: (replace: AccountReplace) => Promise<void>): Promise<void>;
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
  const note = (event: string, options?: SyncLogAddOptions) => syncLog.add(event, options);
  let status: SyncStatus = { kind: 'off' };
  let active = false;
  let suspended = false;
  let running: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let timer: unknown = null;
  /** F6: is the pending timer the 30 s debounce of a local change (not a back-off / quota retry)? */
  let debouncePending = false;
  let remoteResetEpoch: number | null = null;
  /** F8: status updates of a cycle count only while it is the current one (not timed out / overtaken by offline). */
  let generation = 0;
  const listeners = new Set<() => void>();
  const dataListeners = new Set<(change: DataChange) => void>();
  const dataChanged = (change: DataChange) => {
    for (const listener of dataListeners) listener(change);
  };

  const set = (next: SyncStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };

  const schedule = (ms: number, debounce = false) => {
    if (timer !== null) env.clearTimer(timer);
    debouncePending = debounce;
    timer = env.setTimer(() => {
      timer = null;
      debouncePending = false;
      void run();
    }, ms);
  };
  const cancelTimer = () => {
    if (timer !== null) env.clearTimer(timer);
    timer = null;
    debouncePending = false;
  };

  /** Resolves after `ms` with `true`; `cancel()` stops the timer. */
  const delay = (ms: number) => {
    let handle: unknown = null;
    const done = new Promise<true>((resolve) => {
      handle = env.setTimer(() => resolve(true), ms);
    });
    return { done, cancel: () => env.clearTimer(handle) };
  };

  type CycleResult = { readonly ok: true; readonly outcome: SyncOutcome } | { readonly ok: false; readonly error: unknown };

  async function cycle(): Promise<void> {
    const cloud = deps.getCloud();
    if (cloud === null) {
      set({ kind: 'off' });
      return;
    }
    generation += 1;
    const gen = generation;
    const current = () => gen === generation;
    set({ kind: 'syncing' });
    const work: Promise<CycleResult> = runSyncCycle({ repo, cloud, now: env.now, log: note }).then(
      (outcome) => ({ ok: true, outcome }),
      (error: unknown) => ({ ok: false, error }),
    );
    const timeout = delay(CYCLE_TIMEOUT_MS);
    const first = await Promise.race([work, timeout.done]);
    timeout.cancel();
    if (first === true) {
      // F8: the request may still reach the cloud later; it cannot be cancelled. Report the facts now, keep the lock
      // until it settles (no second cycle runs meanwhile), and ignore its status.
      const wasCurrent = current();
      generation += 1;
      note(`sync timed out after ${CYCLE_TIMEOUT_MS / 1000} s${env.isOnline() ? '' : ' (offline)'}: still waiting for the network; nothing is sent twice`);
      if (wasCurrent) {
        if (!env.isOnline()) {
          failures = 0;
          set({ kind: 'offline' }); // retried on `online`
        } else {
          const wait = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!;
          failures += 1;
          set({ kind: 'error', reason: 'network', retryAt: env.now() + wait });
          schedule(wait);
        }
      }
      const late = await work;
      note(`late result of the timed-out sync: ${late.ok ? late.outcome.kind : `failed (${errorReason(late.error)})`}`);
      if (late.ok) dataChangedBy(late.outcome);
      return;
    }
    if (!first.ok) {
      const reason = errorReason(first.error);
      if (reason === 'unknown') log(first.error);
      note(`sync failed: ${reason}${env.isOnline() ? '' : ' (offline)'}`);
      if (!current()) return; // offline already shown; `online` retries
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
    const outcome = first.outcome;
    dataChangedBy(outcome);
    if (!current()) return;
    failures = 0;
    switch (outcome.kind) {
      case 'no-user':
        set({ kind: 'off' });
        return;
      case 'needs-binding':
        if (status.kind !== 'needs-binding') note(`asking before binding (${outcome.reason}); nothing uploaded`, { once: true });
        set({ kind: 'needs-binding', reason: outcome.reason });
        return;
      case 'declined':
        set({ kind: 'declined' });
        return;
      case 'remote-reset':
        remoteResetEpoch = outcome.epoch;
        set({ kind: 'remote-reset', epoch: outcome.epoch, resetAt: outcome.resetAt, unsynced: outcome.unsynced });
        return;
      case 'synced':
        set({ kind: 'idle', lastSyncAt: (await repo.getMeta()).lastSyncAt });
    }
  }

  /** Screens reload what a sync changed on this device (also for a late result: the data is real). */
  function dataChangedBy(outcome: SyncOutcome) {
    if (outcome.kind !== 'synced') return;
    const cards = outcome.pulled > 0 || outcome.renamed > 0 || outcome.cardsUpdated > 0;
    const settings = outcome.settings === 'downloaded';
    if (cards || settings) dataChanged({ cards, settings });
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
          if (!env.isOnline()) {
            set({ kind: 'offline' });
            break;
          }
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
    env.onOffline?.(() => {
      if (!active) return;
      // F8: show it now; a running cycle's request keeps waiting (and is ignored for the status).
      generation += 1;
      failures = 0;
      set({ kind: 'offline' });
    });
    env.onHidden(() => {
      // Only a debounced upload is flushed early (the page may be closed). A back-off / quota wait is NOT shortened:
      // otherwise every tab switch would retry and escalate the back-off (F6, found in G1 T5).
      if (active && debouncePending) void run();
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
      schedule(CHANGE_DEBOUNCE_MS, true);
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
    async replaceAccount(what, writeLocal) {
      const cloud = deps.getCloud();
      if (!active || cloud === null) {
        note(`${what} refused: not signed in (this device syncs with an account)`);
        throw new ReplaceError('not-signed-in', 'Sign in to replace the account data');
      }
      if (!env.isOnline()) {
        note(`${what} refused: offline; nothing changed`);
        throw new ReplaceError('offline', 'Offline');
      }
      suspended = true;
      cancelTimer();
      if (running !== null) {
        // F8: a sync still waiting for the network must finish first (never a replace next to a cycle in flight).
        const wait = delay(CYCLE_TIMEOUT_MS);
        const timedOut = await Promise.race([running.then(() => false), wait.done]);
        wait.cancel();
        if (timedOut) {
          suspended = false;
          note(`${what} refused: a sync is still waiting for the network; nothing changed`);
          throw new ReplaceError('cloud-failed', 'A sync is still in flight');
        }
      }
      const task = async () => {
        const meta = await repo.getMeta();
        let uid: string | null;
        try {
          uid = await cloud.confirmedUid();
        } catch (cause) {
          note(`${what} refused: the account could not be checked with the server; nothing changed`);
          throw new ReplaceError(cause instanceof CloudError && cause.kind === 'network' ? 'offline' : 'cloud-failed', 'Account check failed', { cause });
        }
        if (uid === null || uid !== meta.uid) {
          note(`${what} refused: the signed-in account is not the one this device syncs with; nothing changed`);
          throw new ReplaceError('not-signed-in', 'Different or no account');
        }
        if (meta.knownEpoch === null || meta.pendingReplace) {
          note(`${what} refused: this device has not completed a sync with the account yet; nothing changed`);
          throw new ReplaceError('not-synced', 'Sync first');
        }
        const from = meta.knownEpoch;
        note(`${what} on this device: asking the cloud to raise epoch ${from} -> ${from + 1} (only if it is still ${from})`);
        let epoch: number;
        try {
          epoch = await cloud.bumpEpoch(uid, from, newUuid());
          note(`${what}: the cloud raised the epoch to ${epoch}`);
        } catch (cause) {
          if (cause instanceof CloudError && cause.kind === 'conflict') {
            note(`${what} refused: the account was already replaced from another device (epoch is no longer ${from}); nothing changed`);
            throw new ReplaceError('conflict', 'Replaced elsewhere first', { cause });
          }
          note(`${what} refused: the cloud could not be updated (${cause instanceof CloudError ? cause.kind : 'unknown'}); nothing changed`);
          throw new ReplaceError(cause instanceof CloudError && cause.kind === 'network' ? 'offline' : 'cloud-failed', 'Cloud update failed', { cause });
        }
        try {
          await writeLocal({ uid, epoch });
        } catch (cause) {
          log(cause);
          note(`${what}: the cloud epoch is now ${epoch} but saving on this device FAILED; this device's data is unchanged and no cloud log was deleted`);
          throw new ReplaceError('local-failed', 'Local write failed after the cloud was replaced', { cause });
        }
        note(`${what} done: this device follows epoch ${epoch}; old cloud logs are deleted and this device's uploaded on the next sync`);
      };
      try {
        if (env.locks === null) await task();
        else await env.locks.request(LOCK_NAME, { ifAvailable: false }, task);
      } finally {
        suspended = false;
        failures = 0;
        void run(); // success: clean up + upload; refusal: show the current state (e.g. the remote-reset notice)
      }
    },
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
  onOffline(listener) {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('offline', listener);
    return () => window.removeEventListener('offline', listener);
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
