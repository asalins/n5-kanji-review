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
