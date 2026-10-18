import type { ReviewLog, SyncCursor, UserSettings } from '../../types/entities';

/**
 * What the sync engine needs from the cloud (Firestore in production, loaded lazily with the account chunk).
 * Layout and rules: firestore.rules / docs/sync/l3-sync.md.
 */

export interface CloudRoot {
  readonly epoch: number;
  /** When the epoch was last raised (epoch ms); null if never. */
  readonly resetAt: number | null;
  /** true when this call created the root document (an account that never synced). */
  readonly created: boolean;
}

export interface CloudLogPage {
  /** Logs of every epoch in upload order; the engine keeps only the current epoch. */
  readonly logs: readonly (ReviewLog & { readonly epoch: number })[];
  /** Records that are not valid logs (skipped, counted). */
  readonly invalid: number;
  /** Cursor after the last document of this page; unchanged if the page is empty. */
  readonly cursor: SyncCursor | null;
  /** true = fewer than the page size: nothing more to read now. */
  readonly last: boolean;
}

export type CloudErrorKind = 'network' | 'quota' | 'auth' | 'denied' | 'conflict' | 'unknown';

export class CloudError extends Error {
  constructor(
    readonly kind: CloudErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'CloudError';
  }
}

/** Pages: logs are pushed in batches of at most this many (each create's rule reads users/{uid} once). */
export const PUSH_BATCH = 20;
export const PULL_PAGE = 300;
export const DELETE_BATCH = 400;

export interface CloudStore {
  /**
   * L-1 gate: the uid of the Firebase user, after a FRESH id token was obtained from the server.
   * null = no user. Throws CloudError (network / auth) otherwise. Never answers from the UI state or the hint.
   */
  confirmedUid(): Promise<string | null>;
  /** Reads users/{uid}, creating it (epoch 0) in a transaction when missing. */
  readOrCreateRoot(uid: string): Promise<CloudRoot>;
  /**
   * L4-C1: raises the epoch by one ONLY if it is still `from` (one Firestore transaction = the precondition and the
   * write are atomic); CloudError 'conflict' otherwise. `token` (random, per attempt) is stored as `replacedBy`, so a
   * transaction re-run after a lost commit recognises its OWN commit and never takes another device's for it.
   * D-F9: `settings` (an imported file's) are written in the SAME transaction: the epoch and the account's settings
   * change together or not at all; null = the settings are not part of this replace.
   */
  bumpEpoch(uid: string, from: number, token: string, settings: UserSettings | null): Promise<number>;
  pullLogs(uid: string, after: SyncCursor | null, limit: number): Promise<CloudLogPage>;
  /** Creates the log documents (one batch, ≤ PUSH_BATCH) with `epoch` and a server upload time. */
  pushLogs(uid: string, epoch: number, logs: readonly ReviewLog[]): Promise<void>;
  /** Deletes every log with an epoch below `epoch`. Returns how many were deleted. */
  deleteLogsBelow(uid: string, epoch: number): Promise<number>;
  readSettings(uid: string): Promise<UserSettings | null>;
  /** D-F9: one transaction: writes ONLY if the cloud is still at `epoch` (else CloudError 'conflict'). */
  writeSettings(uid: string, epoch: number, settings: UserSettings): Promise<void>;
  /** Delete Account: users/{uid} first, then every log and the settings. */
  deleteAll(uid: string): Promise<void>;
}
