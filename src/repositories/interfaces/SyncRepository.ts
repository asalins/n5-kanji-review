import type { ReviewLog, SyncMeta, UserSettings } from '../../types/entities';

export const DEFAULT_SYNC_META: SyncMeta = {
  uid: null,
  knownEpoch: null,
  pullCursor: null,
  pendingReplace: false,
  cleanupBelow: null,
  pushSettings: false,
  pullSettings: false,
  declinedUid: null,
  lastSyncAt: null,
};

export interface ApplyRemoteResult {
  /** Cloud logs newly stored on this device. */
  readonly added: number;
  /** Local unsynced logs that were renamed because a different cloud log already owns their id. */
  readonly renamed: number;
  /** Local unsynced copies of a review that the cloud already holds under another id (dropped, not lost). */
  readonly duplicatesDropped: number;
  /** Cards recomputed from their logs (D4). */
  readonly cardsUpdated: number;
}

/**
 * L3b local sync state + the writes the sync engine makes to learning data. Every method is ONE transaction.
 * Cards are always recomputed from logs (services/sync/replay) whenever logs change here.
 */
export interface SyncRepository {
  getMeta(): Promise<SyncMeta>;
  updateMeta(patch: Partial<SyncMeta>): Promise<SyncMeta>;
  /** Is there any learning progress (a review log) on this device? */
  hasLocalProgress(): Promise<boolean>;
  /** Logs not yet on the cloud (no ledger entry), oldest first. */
  pendingLogs(): Promise<readonly ReviewLog[]>;
  /** These logs are now on the cloud in `epoch`. Their cards are recomputed from logs. */
  markUploaded(ids: readonly string[], epoch: number): Promise<void>;
  /** Stores cloud logs (cloud ids are final; colliding local unsynced logs are renamed) and recomputes cards. */
  applyRemoteLogs(logs: readonly ReviewLog[], epoch: number): Promise<ApplyRemoteResult>;
  getSettings(): Promise<UserSettings | null>;
  /** Cloud settings won: store them as they are (their updatedAt is kept, not re-stamped). */
  applyRemoteSettings(settings: UserSettings): Promise<void>;
  /** Another device reset the account: clear local progress + ledger and follow the new epoch (user confirmed). */
  acceptRemoteReset(epoch: number): Promise<void>;
  /** Clear local progress and every sync state: this device no longer belongs to any account. */
  forgetLocalProgress(): Promise<void>;
  /** Bind this device's progress to `uid` (it will be uploaded). */
  bind(uid: string): Promise<void>;
}
