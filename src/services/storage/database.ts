import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { StorageError } from '../../utils/errors';
import type { AppSchema } from './schema';

export const DATABASE_NAME = 'n5-kanji-review';

/** Typed handle used by repositories. */
export type AppDatabase = IDBPDatabase<AppSchema>;
/** Untyped handle given to migrations, so each migration stays frozen as the schema evolves. */
export type MigrationDatabase = IDBPDatabase<unknown>;
export type UpgradeTransaction = IDBPTransaction<unknown, string[], 'versionchange'>;

/**
 * A migration moves the schema up to `version`. It may return a promise when it must read/rewrite records; it may
 * then await ONLY requests on `tx` (anything else would let the upgrade transaction commit early).
 */
export interface Migration {
  readonly version: number;
  readonly description: string;
  readonly migrate: (db: MigrationDatabase, tx: UpgradeTransaction) => void | Promise<void>;
}

/** Versions must be exactly 1, 2, 3 ... with no gaps or duplicates. */
export function assertValidMigrations(migrations: readonly Migration[]): void {
  const versions = migrations.map((m) => m.version).sort((a, b) => a - b);
  versions.forEach((version, index) => {
    const expected = index + 1;
    if (version !== expected) {
      throw new StorageError(`Migrations must be sequential from 1: expected v${expected} but found v${version}`);
    }
  });
}

/** Pure: which migrations must run when upgrading oldVersion -> newVersion, in ascending order. */
export function selectPendingMigrations(
  migrations: readonly Migration[],
  oldVersion: number,
  newVersion: number,
): readonly Migration[] {
  return migrations
    .filter((m) => m.version > oldVersion && m.version <= newVersion)
    .slice()
    .sort((a, b) => a.version - b.version);
}

export function latestVersion(migrations: readonly Migration[]): number {
  return migrations.reduce((max, m) => Math.max(max, m.version), 0);
}

/** Opens the app database, applying pending migrations. Storage failures surface as StorageError. */
export async function openAppDatabase(
  migrations: readonly Migration[],
  name: string = DATABASE_NAME,
): Promise<AppDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new StorageError('IndexedDB is not available in this browser');
  }
  assertValidMigrations(migrations);
  const version = latestVersion(migrations);
  if (version < 1) {
    throw new StorageError('No migrations registered; database cannot be opened');
  }
  let migrationFailure: unknown = null;
  try {
    const db = await openDB<unknown>(name, version, {
      upgrade(upgradeDb, oldVersion, newVersion, tx) {
        const pending = selectPendingMigrations(migrations, oldVersion, newVersion ?? version);
        // Synchronous migrations run synchronously; from the first asynchronous one on, the rest are chained.
        // Any failure aborts the whole versionchange transaction: the database stays at oldVersion, data untouched.
        const fail = (error: unknown) => {
          migrationFailure = error;
          tx.done.catch(() => undefined); // the abort is reported once, by openDB rejecting
          try {
            tx.abort();
          } catch {
            // already aborted
          }
        };
        let chain: Promise<void> | null = null;
        for (const m of pending) {
          if (chain === null) {
            try {
              const result = m.migrate(upgradeDb, tx);
              if (result !== undefined) chain = result;
            } catch (error) {
              fail(error);
              return;
            }
          } else {
            chain = chain.then(() => m.migrate(upgradeDb, tx));
          }
        }
        chain?.catch(fail);
      },
    });
    // The single point where the untyped handle becomes the typed handle for the latest schema.
    return db as unknown as AppDatabase;
  } catch (cause) {
    throw new StorageError('Failed to open the database', { cause: migrationFailure ?? cause });
  }
}
