import type { ReviewCard, ReviewLog, StudySession, UserSettings } from '../../types/entities';

/**
 * L4-C1 (F2): the cloud side of a Reset / Import on a device bound to an account has ALREADY been committed
 * (epoch raised in a Firestore transaction from this device's known epoch). The local write must name it.
 */
export interface AccountReplace {
  readonly uid: string;
  /** The new cloud epoch this device's data now belongs to. */
  readonly epoch: number;
}

/** All user-owned learning data (never the read-only content dataset, never the legacy streakState). */
export interface UserDataSnapshot {
  readonly reviewCards: readonly ReviewCard[];
  readonly reviewLogs: readonly ReviewLog[];
  readonly studySessions: readonly StudySession[];
  /** null = no saved settings (the app then uses its defaults). */
  readonly userSettings: UserSettings | null;
}

export interface UserDataExport extends UserDataSnapshot {
  /** Database schema version the data was read from (audit metadata only). */
  readonly databaseSchemaVersion: number;
}

/**
 * Storage operations for backup / restore / reset. Storage only: JSON parsing, Zod envelope validation and
 * compatibility rules live in services/backup. Every method is ONE storage transaction.
 */
export interface BackupRepository {
  /** One readonly transaction over the four user stores: a consistent snapshot. */
  readUserData(): Promise<UserDataExport>;
  /**
   * One readwrite transaction: clears reviewCards, reviewLogs, studySessions and userSettings, then writes the
   * snapshot. Bound to an account: refused unless `replace` names that account (the cloud was replaced first);
   * then, in the same transaction, the sync state follows the new epoch. All or nothing - a failure anywhere rolls the whole transaction back and the previous data stays.
   */
  replaceUserData(snapshot: UserDataSnapshot, replace?: AccountReplace): Promise<void>;
  /** One readwrite transaction: clears reviewCards, reviewLogs and studySessions. Settings and content stay. */
  resetProgress(replace?: AccountReplace): Promise<void>;
}
