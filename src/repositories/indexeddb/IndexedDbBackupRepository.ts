import type { AppDatabase } from '../../services/storage/database';
import { SINGLETON_KEY, STORES } from '../../services/storage/schema';
import { reviewCardSchema, reviewLogSchema, studySessionSchema, syncMetaSchema, userSettingsSchema } from '../../types/schemas';
import type { AccountReplace, BackupRepository, UserDataExport, UserDataSnapshot } from '../interfaces';
import { ValidationError } from '../../utils/errors';
import { parseRecord, parseRecords, runRepositoryOperation } from './guard';

const USER_STORES = [STORES.reviewCards, STORES.reviewLogs, STORES.studySessions, STORES.userSettings] as const;
const PROGRESS_STORES = [STORES.reviewCards, STORES.reviewLogs, STORES.studySessions] as const;
const SYNC_STORES = [STORES.syncLedger, STORES.syncMeta] as const;

/**
 * L4-C1 (F2): Reset progress / Import (Replace) on a device whose progress is bound to an account may only run AFTER
 * the account's cloud data was replaced (epoch raised atomically from this device's known epoch, by the sync
 * service). In the same transaction as the data: the ledger is cleared and the sync state follows the new epoch
 * (old-epoch cloud logs are deleted and this device's logs uploaded on the next sync). Without `replace` a bound
 * device is refused and NOTHING changes. Not bound: local only, as before.
 */
async function followReplace(
  tx: { objectStore(name: (typeof SYNC_STORES)[number]): { clear(): Promise<unknown>; get(key: string): Promise<unknown>; put(value: never, key: string): Promise<unknown> } },
  replace: AccountReplace | undefined,
): Promise<void> {
  const raw = await tx.objectStore(STORES.syncMeta).get(SINGLETON_KEY);
  const meta = raw === undefined ? null : parseRecord(syncMetaSchema, raw, 'sync meta');
  if (meta === null || meta.uid === null) {
    await tx.objectStore(STORES.syncLedger).clear();
    return;
  }
  if (replace === undefined || replace.uid !== meta.uid) {
    throw new ValidationError('This device syncs with an account: its cloud data must be replaced first');
  }
  await tx.objectStore(STORES.syncLedger).clear();
  await tx.objectStore(STORES.syncMeta).put(
    // D-F9: settings are not pushed by timestamp after a replace. An imported file's settings were already written in
    // the SAME cloud transaction as the epoch; a reset (or a file without settings) leaves the account's settings
    // to the normal rule (D5).
    { ...meta, knownEpoch: replace.epoch, cleanupBelow: replace.epoch, pushSettings: false, pullSettings: false, pullCursor: null, pendingReplace: false } as never,
    SINGLETON_KEY,
  );
}
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

  replaceUserData(snapshot: UserDataSnapshot, replace?: AccountReplace): Promise<void> {
    return runRepositoryOperation('BackupRepository.replaceUserData', async () => {
      // Validate every record BEFORE the transaction opens: invalid input never reaches (or clears) the stores.
      const cards = parseRecords(reviewCardSchema, snapshot.reviewCards, 'review card');
      const logs = parseRecords(reviewLogSchema, snapshot.reviewLogs, 'review log');
      const sessions = parseRecords(studySessionSchema, snapshot.studySessions, 'study session');
      const settings = snapshot.userSettings === null ? null : parseRecord(userSettingsSchema, snapshot.userSettings, 'settings');

      // ONE readwrite transaction: clear and write together, so a failure anywhere rolls everything back.
      const tx = this.db.transaction([...USER_STORES, ...SYNC_STORES], 'readwrite');
      const done = tx.done;
      try {
        await eachStore(USER_STORES, (store) => tx.objectStore(store as (typeof USER_STORES)[number]).clear());
        await followReplace(tx, replace);
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

  resetProgress(replace?: AccountReplace): Promise<void> {
    return runRepositoryOperation('BackupRepository.resetProgress', async () => {
      const tx = this.db.transaction([...PROGRESS_STORES, ...SYNC_STORES], 'readwrite');
      const done = tx.done;
      try {
        await eachStore(PROGRESS_STORES, (store) => tx.objectStore(store as (typeof PROGRESS_STORES)[number]).clear());
        await followReplace(tx, replace);
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
