import type { IDBPTransaction } from 'idb';
import type { AppDatabase } from '../../services/storage/database';
import { SINGLETON_KEY, STORES, type AppSchema } from '../../services/storage/schema';
import { replayCard } from '../../services/sync/replay';
import { canonicalEvent, renameForCollision, rootIdOf } from '../../services/sync/logCollision';
import { reviewCardSchema, reviewLogSchema, syncMetaSchema, userSettingsSchema } from '../../types/schemas';
import type { ReviewLog, SyncMeta, UserSettings } from '../../types/entities';
import { DEFAULT_SYNC_META, type ApplyRemoteResult, type SyncRepository } from '../interfaces';
import { parseRecord, parseRecords, runRepositoryOperation } from './guard';

type StoreName = (typeof STORES)[keyof typeof STORES];
type Tx = IDBPTransaction<AppSchema, StoreName[], 'readwrite'>;

/** Runs `body` in one transaction; any failure aborts it, so nothing is half-written. */
async function inTransaction<T>(db: AppDatabase, stores: readonly StoreName[], body: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = db.transaction([...stores], 'readwrite');
  const done = tx.done;
  try {
    const result = await body(tx);
    await done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // already finished or aborted
    }
    await done.catch(() => undefined);
    throw error;
  }
}

const byTime = (a: ReviewLog, b: ReviewLog) => a.reviewedAt - b.reviewedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sameEvent = (a: ReviewLog, b: ReviewLog) => canonicalEvent(a) === canonicalEvent(b) && rootIdOf(a) === rootIdOf(b);

async function readMeta(tx: Tx): Promise<SyncMeta> {
  const raw = await tx.objectStore(STORES.syncMeta).get(SINGLETON_KEY);
  return raw === undefined ? DEFAULT_SYNC_META : parseRecord(syncMetaSchema, raw, 'sync meta');
}

/** Recomputes (D4) the cards of `cardIds` from the given full log set and stores them. Returns how many changed. */
async function recomputeCards(tx: Tx, cardIds: Iterable<string>, logs: Iterable<ReviewLog>): Promise<number> {
  const wanted = new Set(cardIds);
  if (wanted.size === 0) return 0;
  const byCard = new Map<string, ReviewLog[]>();
  for (const log of logs) if (wanted.has(log.cardId)) byCard.set(log.cardId, [...(byCard.get(log.cardId) ?? []), log]);
  const store = tx.objectStore(STORES.reviewCards);
  let changed = 0;
  for (const [cardId, cardLogs] of byCard) {
    const card = replayCard(cardId, cardLogs);
    if (card === null) continue; // not a card id this app understands: the logs are kept, no card is invented
    const stored = (await store.get(cardId)) as Record<string, unknown> | undefined;
    const valid = parseRecord(reviewCardSchema, card, 'review card');
    const same = stored !== undefined && Object.keys(stored).length === Object.keys(valid).length && (Object.keys(valid) as (keyof typeof valid)[]).every((k) => stored[k] === valid[k]);
    if (!same) {
      await store.put(valid);
      changed += 1;
    }
  }
  return changed;
}

export class IndexedDbSyncRepository implements SyncRepository {
  constructor(private readonly db: AppDatabase) {}

  getMeta(): Promise<SyncMeta> {
    return runRepositoryOperation('SyncRepository.getMeta', async () => {
      const raw = await this.db.get(STORES.syncMeta, SINGLETON_KEY);
      return raw === undefined ? DEFAULT_SYNC_META : parseRecord(syncMetaSchema, raw, 'sync meta');
    });
  }

  updateMeta(patch: Partial<SyncMeta>): Promise<SyncMeta> {
    return runRepositoryOperation('SyncRepository.updateMeta', () =>
      inTransaction(this.db, [STORES.syncMeta], async (tx) => {
        const next = parseRecord(syncMetaSchema, { ...(await readMeta(tx)), ...patch }, 'sync meta');
        await tx.objectStore(STORES.syncMeta).put(next, SINGLETON_KEY);
        return next;
      }),
    );
  }

  hasLocalProgress(): Promise<boolean> {
    return runRepositoryOperation('SyncRepository.hasLocalProgress', async () => (await this.db.count(STORES.reviewLogs)) > 0);
  }

  pendingLogs(): Promise<readonly ReviewLog[]> {
    return runRepositoryOperation('SyncRepository.pendingLogs', async () => {
      const tx = this.db.transaction([STORES.reviewLogs, STORES.syncLedger]);
      const [logs, uploaded] = await Promise.all([tx.objectStore(STORES.reviewLogs).getAll(), tx.objectStore(STORES.syncLedger).getAllKeys()]);
      await tx.done;
      const done = new Set(uploaded);
      return parseRecords(reviewLogSchema, logs, 'review log')
        .filter((log) => !done.has(log.id))
        .sort(byTime);
    });
  }

  markUploaded(ids: readonly string[], epoch: number): Promise<void> {
    return runRepositoryOperation('SyncRepository.markUploaded', () =>
      inTransaction(this.db, [STORES.reviewLogs, STORES.reviewCards, STORES.syncLedger], async (tx) => {
        const logs = parseRecords(reviewLogSchema, await tx.objectStore(STORES.reviewLogs).getAll(), 'review log');
        const present = new Map(logs.map((l) => [l.id, l]));
        const cards = new Set<string>();
        for (const id of ids) {
          const log = present.get(id);
          if (log === undefined) continue; // removed meanwhile (e.g. a reset): nothing to mark
          await tx.objectStore(STORES.syncLedger).put({ epoch }, id);
          cards.add(log.cardId);
        }
        // A review recorded while a pull rewrote its card is corrected here (cards always follow the logs).
        await recomputeCards(tx, cards, logs);
      }),
    );
  }

  applyRemoteLogs(remote: readonly ReviewLog[], epoch: number): Promise<ApplyRemoteResult> {
    return runRepositoryOperation('SyncRepository.applyRemoteLogs', async () => {
      const incoming = parseRecords(reviewLogSchema, remote, 'review log');
      return inTransaction(this.db, [STORES.reviewLogs, STORES.reviewCards, STORES.syncLedger], async (tx) => {
        const logStore = tx.objectStore(STORES.reviewLogs);
        const ledger = tx.objectStore(STORES.syncLedger);
        const all = new Map(parseRecords(reviewLogSchema, await logStore.getAll(), 'review log').map((l) => [l.id, l]));
        const uploaded = new Set(await ledger.getAllKeys());
        const taken = new Set([...all.keys(), ...incoming.map((l) => l.id)]);
        const touched = new Set<string>();
        let added = 0;
        let renamed = 0;
        let duplicatesDropped = 0;

        for (const cloud of incoming) {
          const local = all.get(cloud.id);
          if (local !== undefined && sameEvent(local, cloud)) {
            await ledger.put({ epoch }, cloud.id); // already here: now known to be on the cloud
            uploaded.add(cloud.id);
            continue;
          }
          if (local !== undefined) {
            // Same id, different review (legacy `cardId#n` ids from two devices). The cloud id is final:
            // the local review moves to a new id, keeps its originalId link, and is uploaded later. Nothing is lost.
            const moved = renameForCollision(local, taken);
            taken.add(moved.id);
            await logStore.delete(local.id);
            await logStore.add(moved);
            await ledger.delete(local.id);
            uploaded.delete(local.id);
            all.delete(local.id);
            all.set(moved.id, moved);
            touched.add(moved.cardId);
            renamed += 1;
          } else {
            // The same review may be here unsynced under another id (renamed differently elsewhere): keep one copy.
            for (const other of all.values()) {
              if (!uploaded.has(other.id) && sameEvent(other, cloud)) {
                await logStore.delete(other.id);
                all.delete(other.id);
                duplicatesDropped += 1;
                break;
              }
            }
          }
          await logStore.add(cloud);
          await ledger.put({ epoch }, cloud.id);
          uploaded.add(cloud.id);
          all.set(cloud.id, cloud);
          touched.add(cloud.cardId);
          added += 1;
        }
        const cardsUpdated = await recomputeCards(tx, touched, all.values());
        return { added, renamed, duplicatesDropped, cardsUpdated };
      });
    });
  }

  getSettings(): Promise<UserSettings | null> {
    return runRepositoryOperation('SyncRepository.getSettings', async () => {
      const raw = await this.db.get(STORES.userSettings, SINGLETON_KEY);
      return raw === undefined ? null : parseRecord(userSettingsSchema, raw, 'settings');
    });
  }

  applyRemoteSettings(settings: UserSettings): Promise<void> {
    return runRepositoryOperation('SyncRepository.applyRemoteSettings', async () => {
      await this.db.put(STORES.userSettings, parseRecord(userSettingsSchema, settings, 'settings'), SINGLETON_KEY);
    });
  }

  acceptRemoteReset(epoch: number): Promise<void> {
    return runRepositoryOperation('SyncRepository.acceptRemoteReset', () =>
      inTransaction(this.db, [STORES.reviewCards, STORES.reviewLogs, STORES.studySessions, STORES.syncLedger, STORES.syncMeta], async (tx) => {
        const meta = await readMeta(tx);
        for (const store of [STORES.reviewCards, STORES.reviewLogs, STORES.studySessions, STORES.syncLedger] as const) await tx.objectStore(store).clear();
        await tx.objectStore(STORES.syncMeta).put({ ...meta, knownEpoch: epoch, pullCursor: null, pendingReplace: false, cleanupBelow: null, pushSettings: false, pullSettings: true }, SINGLETON_KEY);
      }),
    );
  }

  forgetLocalProgress(): Promise<void> {
    return runRepositoryOperation('SyncRepository.forgetLocalProgress', () =>
      inTransaction(this.db, [STORES.reviewCards, STORES.reviewLogs, STORES.studySessions, STORES.syncLedger, STORES.syncMeta], async (tx) => {
        for (const store of [STORES.reviewCards, STORES.reviewLogs, STORES.studySessions, STORES.syncLedger, STORES.syncMeta] as const) await tx.objectStore(store).clear();
      }),
    );
  }

  bind(uid: string): Promise<void> {
    return runRepositoryOperation('SyncRepository.bind', () =>
      inTransaction(this.db, [STORES.syncLedger, STORES.syncMeta], async (tx) => {
        // A fresh binding: nothing of this device is on that account yet; the epoch is learned on the first sync.
        await tx.objectStore(STORES.syncLedger).clear();
        await tx.objectStore(STORES.syncMeta).put({ ...DEFAULT_SYNC_META, uid }, SINGLETON_KEY);
      }),
    );
  }
}
