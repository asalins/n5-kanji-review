import { createReviewOrchestrator } from '../features/review/reviewOrchestrator';
import type { AppRepositories } from '../hooks/useRepositories';
import { createIndexedDbRepositories, type Repositories } from '../repositories/indexeddb';
import { loadBundledDataset } from '../services/content/bundledDataset';
import { createProjectListSource } from '../services/content/projectList';
import { requestPersistentStorage } from '../services/persistence/persistentStorage';
import { openDefaultDatabase } from '../services/storage/appDatabase';
import { createDefaultAccountService } from '../services/account';
import { browserSyncEnvironment, createSyncService, type SyncEnvironment, type SyncService } from '../services/sync/syncService';
import { logError } from '../utils/userMessage';

export interface AppServiceOptions {
  /** Test-only: deterministic ReviewLog ids (e.g. to force an id collision inside the write transaction). */
  readonly newLogId?: () => string;
  /** Test-only: the sync scheduler's environment (timers, network, locks). */
  readonly syncEnv?: SyncEnvironment;
}

/** Wires repositories and the review orchestrator (rating -> SRS -> atomic card + log write). */
export function buildAppServices(repositories: Repositories, options: AppServiceOptions = {}): AppRepositories {
  // Account <-> sync are built together: Delete Account asks sync to delete the cloud data first (D-L2-6),
  // and sync reads the cloud of the account's lazily loaded SDK.
  let sync: SyncService | null = null;
  const account = createDefaultAccountService(
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
    sync = createSyncService({ repo: repositories.sync, getCloud: () => account.getCloud(), env: options.syncEnv ?? browserSyncEnvironment(), logError });
    const follow = () => {
      const kind = account.getStatus().kind;
      sync?.setActive(kind === 'signed-in' || kind === 'signed-in-offline');
    };
    account.subscribe(follow);
  }
  const changed = () => sync?.notifyLocalChange();
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
      replaceUserData: async (snapshot) => {
        await repositories.backup.replaceUserData(snapshot);
        changed();
      },
      resetProgress: async () => {
        await repositories.backup.resetProgress();
        changed();
      },
    },
    account,
    ...(sync === null ? {} : { sync }),
    newItems: createProjectListSource(),
    reviewOrchestrator: {
      async submit(request) {
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
  const services = buildAppServices(repositories);
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
