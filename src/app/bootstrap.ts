import { createReviewOrchestrator } from '../features/review/reviewOrchestrator';
import type { AppRepositories } from '../hooks/useRepositories';
import { createIndexedDbRepositories, type Repositories } from '../repositories/indexeddb';
import type { AccountReplace } from '../repositories/interfaces';
import type { UserSettings } from '../types/entities';
import { ClockSkewError, browserClockEnvironment, createClockService, describeSkew, type ClockService } from '../services/clock/clockCheck';
import { loadBundledDataset } from '../services/content/bundledDataset';
import { createProjectListSource } from '../services/content/projectList';
import { requestPersistentStorage } from '../services/persistence/persistentStorage';
import { openDefaultDatabase } from '../services/storage/appDatabase';
import { createDefaultAccountService, type AccountService } from '../services/account';
import { browserSyncEnvironment, createSyncService, type SyncEnvironment, type SyncService } from '../services/sync/syncService';
import { createSyncLog, type SyncLog } from '../services/sync/syncLog';
import { logError } from '../utils/userMessage';

export interface AppServiceOptions {
  /** Test-only: deterministic ReviewLog ids (e.g. to force an id collision inside the write transaction). */
  readonly newLogId?: () => string;
  /** Test-only: the sync scheduler's environment (timers, network, locks). */
  readonly syncEnv?: SyncEnvironment;
  /** Test-only: the F5 diagnostic log. */
  readonly syncLog?: SyncLog;
  /** F10-A: the device-clock check (production: against the server's Date). Absent = no clock guard (tests). */
  readonly clock?: ClockService;
  /** Test-only: an account service instead of the Firebase one (to exercise the real sync wiring). */
  readonly account?: AccountService;
}

/** Wires repositories and the review orchestrator (rating -> SRS -> atomic card + log write). */
export function buildAppServices(repositories: Repositories, options: AppServiceOptions = {}): AppRepositories {
  // Account <-> sync are built together: Delete Account asks sync to delete the cloud data first (D-L2-6),
  // and sync reads the cloud of the account's lazily loaded SDK.
  let sync: SyncService | null = null;
  const account = options.account ?? createDefaultAccountService(
    // Sign-out / Delete Account "also delete progress on this device": the progress AND its binding to the account.
    () => repositories.sync.forgetLocalProgress(),
    logError,
    {
      delete: (uid) => sync?.deleteCloudData(uid) ?? Promise.resolve('failed' as const),
      resume: () => sync?.resume(),
    },
  );
  const accountUsed = account.getStatus().kind !== 'unavailable';
  if (accountUsed) {
    sync = createSyncService({
      repo: repositories.sync,
      getCloud: () => account.getCloud(),
      env: options.syncEnv ?? browserSyncEnvironment(),
      logError,
      syncLog: options.syncLog ?? createSyncLog(),
    });
    const follow = () => {
      const kind = account.getStatus().kind;
      sync?.setActive(kind === 'signed-in' || kind === 'signed-in-offline');
    };
    account.subscribe(follow);
  }
  const changed = () => sync?.notifyLocalChange();
  /**
   * Reset progress / Import (Replace). Bound to an account (L4-C1, F2): the cloud is replaced FIRST, atomically from
   * this device's known epoch, and only then the local data (syncService.replaceAccount). Not bound: local only.
   */
  const replaceData = async (what: string, writeLocal: (replace?: AccountReplace) => Promise<void>, settings: UserSettings | null) => {
    if (sync !== null && (await sync.isBound())) {
      // D-F9: an imported file's settings become the account's settings in the same cloud transaction as the epoch.
      await sync.replaceAccount(what, (replace) => writeLocal(replace), settings);
    } else {
      await writeLocal();
      sync?.log.add(`${what} on this device (not bound to an account: local only)`);
    }
    changed();
  };
  const orchestrator = createReviewOrchestrator({
    recorder: repositories.review,
    getDatasetVersion: () => repositories.kanji.getDatasetVersion(),
    getDeviceId: () => repositories.device.getDeviceId(),
    ...(options.newLogId === undefined ? {} : { newLogId: options.newLogId }),
  });
  return {
    kanji: repositories.kanji,
    review: repositories.review,
    settings: {
      get: () => repositories.settings.get(),
      save: async (value) => {
        await repositories.settings.save(value);
        changed();
      },
    },
    backup: {
      readUserData: () => repositories.backup.readUserData(),
      // Reset / Import mark a bound account's cloud for replacement (same transaction); sync it soon.
      replaceUserData: (snapshot) => replaceData('Import (Replace)', (replace) => repositories.backup.replaceUserData(snapshot, replace), snapshot.userSettings),
      resetProgress: () => replaceData('Reset progress', (replace) => repositories.backup.resetProgress(replace), null),
    },
    account,
    ...(sync === null ? {} : { sync }),
    newItems: createProjectListSource(),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    reviewOrchestrator: {
      async submit(request) {
        // F10-A: a NEW review is not recorded while the device clock is known (fresh server time) to be wrong.
        // Unknown (offline, no server time, stale) never blocks: offline-first. Practice mode never comes here.
        const clock = options.clock;
        if (clock !== undefined) {
          let state = clock.current();
          if (state.kind === 'unknown' && (state.reason === 'stale' || state.reason === 'not-checked')) state = await clock.check();
          if (state.kind === 'wrong') {
            sync?.log.add(`review NOT recorded: the device clock is ${describeSkew(state.skewMs)} (server time)`, { once: true });
            throw new ClockSkewError(state.skewMs);
          }
        }
        await orchestrator.submit(request);
        changed();
      },
    },
  };
}

async function start(): Promise<AppRepositories> {
  const db = await openDefaultDatabase();
  const repositories = createIndexedDbRepositories(db);
  // Replaces the content stores only when the bundled dataset version differs from the stored one.
  await loadBundledDataset({ writer: repositories.contentWriter, reader: repositories.kanji, now: Date.now });
  // Ask the browser not to evict the learning data. Not awaited: start-up never waits for or fails on it.
  void requestPersistentStorage();
  // F10-A: measure the device clock against the server now, when back online and when the app is shown again.
  const clock = createClockService(browserClockEnvironment());
  void clock.check();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void clock.check());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void clock.check();
    });
  }
  const services = buildAppServices(repositories, { clock });
  // Optional account: loads Firebase only if this browser had a session (hint). Never blocks or fails start-up.
  services.account?.start();
  return services;
}

let started: Promise<AppRepositories> | null = null;

/** Composition root: opens storage and loads content once (safe under React StrictMode). */
export function bootstrapApp(): Promise<AppRepositories> {
  if (started === null) {
    started = start().catch((error: unknown) => {
      started = null; // allow a retry after a failure
      throw error;
    });
  }
  return started;
}
