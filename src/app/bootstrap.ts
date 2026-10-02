import type { AppRepositories } from '../hooks/useRepositories';
import { createIndexedDbRepositories } from '../repositories/indexeddb';
import { loadBundledDataset } from '../services/content/bundledDataset';
import { openDefaultDatabase } from '../services/storage/appDatabase';

async function start(): Promise<AppRepositories> {
  const db = await openDefaultDatabase();
  const repositories = createIndexedDbRepositories(db);
  // Replaces the content stores only when the bundled dataset version differs from the stored one.
  await loadBundledDataset({ writer: repositories.contentWriter, reader: repositories.kanji, now: Date.now });
  return { kanji: repositories.kanji, review: repositories.review };
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
