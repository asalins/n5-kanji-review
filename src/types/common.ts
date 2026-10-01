/**
 * Persisted timestamps are Unix epoch MILLISECONDS (integer, UTC instant).
 * One representation everywhere (cards, logs, sessions, streak). Day-boundary / timezone
 * rules are NOT decided here; they belong to the feature that needs them (Phase 7).
 */
export type EpochMs = number;

/**
 * Enumerations are `as const` tuples so the Zod schemas and TS types share one source.
 * Adding a value (a new item type or study mode) is a code change only: the database
 * stores these as plain strings and no index depends on the set of values.
 */
export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

export const ITEM_TYPES = ['kanji', 'vocabulary', 'hiragana', 'katakana', 'grammar'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** A = Kanji->Meaning, B = Meaning->Kanji, C = Kanji->Reading, D = Reading->Kanji (Phase 0). */
export const STUDY_MODES = ['A', 'B', 'C', 'D'] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const READING_TYPES = ['on', 'kun'] as const;
export type ReadingType = (typeof READING_TYPES)[number];

/** Structural only: what a state or rating MEANS is decided by the SRS (Phase 5). */
export const LEARNING_STATES = ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING', 'MASTERED'] as const;
export type LearningState = (typeof LEARNING_STATES)[number];

export const REVIEW_RATINGS = ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const UI_LANGUAGES = ['th', 'en'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

/** ReviewCard points at content by itemType + itemId so later content types reuse the same tables. */
export interface ItemRef {
  readonly itemType: ItemType;
  readonly itemId: string;
}
