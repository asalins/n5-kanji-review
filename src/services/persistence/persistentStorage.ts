/**
 * Asks the browser to keep this site's storage (IndexedDB with the learning data) instead of evicting it
 * under storage pressure. Never throws and never blocks start-up; the browser decides (Chrome grants it to
 * installed or frequently used sites without a prompt, Firefox may ask, older browsers do not support it).
 * It does not read or write any learning data.
 */
export type PersistenceStatus = 'persistent' | 'not-persistent' | 'unsupported' | 'unknown';

/** The part of `navigator.storage` this module uses (injectable for tests). */
export interface PersistenceApi {
  readonly persist?: () => Promise<boolean>;
  readonly persisted?: () => Promise<boolean>;
}

function browserStorage(): PersistenceApi | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator.storage as PersistenceApi | undefined);
}

/** Current state without asking for anything. */
export async function readPersistentStorage(storage: PersistenceApi | undefined = browserStorage()): Promise<PersistenceStatus> {
  if (storage === undefined || typeof storage.persisted !== 'function') return 'unsupported';
  try {
    return (await storage.persisted()) ? 'persistent' : 'not-persistent';
  } catch {
    return 'unknown';
  }
}

/** Requests persistence once; returns the resulting state. */
export async function requestPersistentStorage(storage: PersistenceApi | undefined = browserStorage()): Promise<PersistenceStatus> {
  if (storage === undefined || typeof storage.persist !== 'function') return 'unsupported';
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'persistent';
    return (await storage.persist()) ? 'persistent' : 'not-persistent';
  } catch {
    return 'unknown';
  }
}
