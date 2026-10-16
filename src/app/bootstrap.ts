import { createReviewOrchestrator } from '../features/review/reviewOrchestrator';
import type { AppRepositories } from '../hooks/useRepositories';
import { createIndexedDbRepositories, type Repositories } from '../repositories/indexeddb';
import { loadBundledDataset } from '../services/content/bundledDataset';
import { createProjectListSource } from '../services/content/projectList';
import { requestPersistentStorage } from '../services/persistence/persistentStorage';
import { openDefaultDatabase } from '../services/storage/appDatabase';

export interface AppServiceOptions {
  /** Test-only: deterministic ReviewLog ids (e.g. to force an id collision inside the write transaction). */
  readonly newLogId?: () => string;
}

/** Wires repositories and the review orchestrator (rating -> SRS -> atomic card + log write). */
export function buildAppServices(repositories: Repositories, options: AppServiceOptions = {}): AppRepositories {
  return {
    kanji: repositories.kanji,
    review: repositories.review,
    settings: repositories.settings,
    backup: repositories.backup,
    newItems: createProjectListSource(),
    reviewOrchestrator: createReviewOrchestrator({
      recorder: repositories.review,
      getDatasetVersion: () => repositories.kanji.getDatasetVersion(),
      getDeviceId: () => repositories.device.getDeviceId(),
      ...(options.newLogId === undefined ? {} : { newLogId: options.newLogId }),
    }),
  };
}

async function start(): Promise<AppRepositories> {
  const db = await openDefaultDatabase();
  const repositories = createIndexedDbRepositories(db);
  // Replaces the content stores only when the bundled dataset version differs from the stored one.
  await loadBundledDataset({ writer: repositories.contentWriter, reader: repositories.kanji, now: Date.now });
  // Ask the browser not to evict the learning data. Not awaited: start-up never waits for or fails on it.
  void requestPersistentStorage();
  return buildAppServices(repositories);
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
