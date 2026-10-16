import type {
  EpochMs,
  ItemRef,
  LearningState,
  ReviewRating,
  StudyMode,
  Theme,
  UiLanguage,
} from './common';

/** User entities are read-write and live only in the user's local database. */

export interface ReviewCard extends ItemRef {
  /** `${itemType}:${itemId}:${mode}` (see buildReviewCardId). */
  readonly id: string;
  readonly mode: StudyMode;
  readonly state: LearningState;
  /** Units and meaning are defined by the SRS algorithm (Phase 5). */
  readonly interval: number;
  readonly ease: number;
  readonly due: EpochMs;
  readonly reviewCount: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly lastReviewed: EpochMs | null;
  /** Which SRS algorithm version last produced this card's scheduling fields. */
  readonly algorithmVersion: string;
}

export interface ReviewLog {
  readonly id: string;
  readonly cardId: string;
  readonly rating: ReviewRating;
  readonly reviewedAt: EpochMs;
  readonly durationMs: number;
  readonly stateBefore: LearningState;
  readonly stateAfter: LearningState;
  /** Version of the content dataset the card was shown from; null when unknown. */
  readonly datasetVersion: string | null;
  /**
   * Provenance: the installation (DeviceMeta.deviceId) that recorded this review. null for logs recorded before
   * schema v3 / backup format v2, whose origin is unknown. Kept in backups (it describes the event, not this device).
   */
  readonly deviceId: string | null;
  /**
   * null for every log as recorded. Set only by the collision resolver (services/sync/logCollision): the id this
   * log had before it was renamed because another, different log already used that id. Then id = `${originalId}~<hash>`.
   */
  readonly originalId: string | null;
}

export interface StudySessionSummary {
  readonly reviewedCount: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
}

export interface StudySession {
  readonly id: string;
  readonly startedAt: EpochMs;
  /** null while the session is in progress. */
  readonly endedAt: EpochMs | null;
  readonly cardIds: readonly string[];
  /** null until the session ends. Values are supplied by the caller, never computed here. */
  readonly summary: StudySessionSummary | null;
}

export interface UserSettings {
  readonly dailyNewCards: number;
  readonly dailyReviewLimit: number;
  readonly theme: Theme;
  readonly uiLanguage: UiLanguage;
  readonly soundEnabled: boolean;
  readonly autoPlay: boolean;
  readonly studyMode: StudyMode;
  readonly animationsEnabled: boolean;
  /**
   * Device wall-clock time (epoch ms) of the user's last explicit save of these settings on the device that saved
   * them; stamped by SettingsRepository.save only. 0 = unknown / oldest (defaults, schema-v2 data, backup format v1).
   * Informational for a future merge only: clocks differ between devices, so it never proves which change came first.
   */
  readonly updatedAt: EpochMs;
}

/**
 * Identity of THIS installation (one record, schema v3). Created once by migration v3 (or on first read if missing).
 * Never exported in a backup, never replaced by Import (Replace) and never cleared by Reset progress or Reset settings.
 */
export interface DeviceMeta {
  readonly deviceId: string;
  readonly createdAt: EpochMs;
}

export interface StreakState {
  /**
   * Instant (epoch ms) of the last study that counted toward the streak; null if never.
   * Named per the Phase 0 spec. The local-day derivation is a Phase 7 rule.
   */
  readonly lastStudyDate: EpochMs | null;
  readonly currentStreak: number;
  readonly longestStreak: number;
}
