import type { ReviewCard, ReviewLog, StudySession, UserSettings } from '../../types/entities';

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
   * snapshot. All or nothing - a failure anywhere rolls the whole transaction back and the previous data stays.
   */
  replaceUserData(snapshot: UserDataSnapshot): Promise<void>;
  /** One readwrite transaction: clears reviewCards, reviewLogs and studySessions. Settings and content stay. */
  resetProgress(): Promise<void>;
}
