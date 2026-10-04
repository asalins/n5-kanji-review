import type { AppDatabase } from '../../services/storage/database';
import { SINGLETON_KEY, STORES } from '../../services/storage/schema';
import { reviewCardSchema, reviewLogSchema, studySessionSchema, userSettingsSchema } from '../../types/schemas';
import type { BackupRepository, UserDataExport, UserDataSnapshot } from '../interfaces';
import { parseRecord, parseRecords, runRepositoryOperation } from './guard';

const USER_STORES = [STORES.reviewCards, STORES.reviewLogs, STORES.studySessions, STORES.userSettings] as const;
const PROGRESS_STORES = [STORES.reviewCards, STORES.reviewLogs, STORES.studySessions] as const;
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Starts one request per store and waits for all. Each request gets a handler as soon as it exists, so if a
 * later request throws (and the transaction aborts) the earlier ones never become unhandled rejections.
 */
async function eachStore(stores: readonly string[], start: (store: string) => Promise<unknown>): Promise<void> {
  const requests: Promise<unknown>[] = [];
  for (const store of stores) {
    const request = start(store);
    request.catch(() => undefined);
    requests.push(request);
  }
  await Promise.all(requests);
}

export class IndexedDbBackupRepository implements BackupRepository {
  constructor(private readonly db: AppDatabase) {}

  readUserData(): Promise<UserDataExport> {
    return runRepositoryOperation('BackupRepository.readUserData', async () => {
      const tx = this.db.transaction(USER_STORES, 'readonly');
      const [cards, logs, sessions, settings] = await Promise.all([
        tx.objectStore(STORES.reviewCards).getAll(),
        tx.objectStore(STORES.reviewLogs).getAll(),
        tx.objectStore(STORES.studySessions).getAll(),
        tx.objectStore(STORES.userSettings).get(SINGLETON_KEY),
      ]);
      await tx.done;
      return {
        databaseSchemaVersion: this.db.version,
        reviewCards: parseRecords(reviewCardSchema, cards, 'review card').sort(byId),
        reviewLogs: parseRecords(reviewLogSchema, logs, 'review log').sort(byId),
        studySessions: parseRecords(studySessionSchema, sessions, 'study session').sort(byId),
        userSettings: settings === undefined ? null : parseRecord(userSettingsSchema, settings, 'settings'),
      };
    });
  }

  replaceUserData(snapshot: UserDataSnapshot): Promise<void> {
    return runRepositoryOperation('BackupRepository.replaceUserData', async () => {
      // Validate every record BEFORE the transaction opens: invalid input never reaches (or clears) the stores.
      const cards = parseRecords(reviewCardSchema, snapshot.reviewCards, 'review card');
      const logs = parseRecords(reviewLogSchema, snapshot.reviewLogs, 'review log');
      const sessions = parseRecords(studySessionSchema, snapshot.studySessions, 'study session');
      const settings = snapshot.userSettings === null ? null : parseRecord(userSettingsSchema, snapshot.userSettings, 'settings');

      // ONE readwrite transaction: clear and write together, so a failure anywhere rolls everything back.
      const tx = this.db.transaction(USER_STORES, 'readwrite');
      const done = tx.done;
      try {
        await eachStore(USER_STORES, (store) => tx.objectStore(store as (typeof USER_STORES)[number]).clear());
        for (const card of cards) await tx.objectStore(STORES.reviewCards).add(card); // add: a duplicate id fails
        for (const log of logs) await tx.objectStore(STORES.reviewLogs).add(log);
        for (const session of sessions) await tx.objectStore(STORES.studySessions).add(session);
        if (settings !== null) await tx.objectStore(STORES.userSettings).put(settings, SINGLETON_KEY);
        await done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // already finished or aborted
        }
        await done.catch(() => undefined);
        throw error;
      }
    });
  }

  resetProgress(): Promise<void> {
    return runRepositoryOperation('BackupRepository.resetProgress', async () => {
      const tx = this.db.transaction(PROGRESS_STORES, 'readwrite');
      const done = tx.done;
      try {
        await eachStore(PROGRESS_STORES, (store) => tx.objectStore(store as (typeof PROGRESS_STORES)[number]).clear());
        await done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // already finished or aborted
        }
        await done.catch(() => undefined);
        throw error;
      }
    });
  }
}
