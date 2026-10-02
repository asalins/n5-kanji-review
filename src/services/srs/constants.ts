/**
 * srs-v1 constants. The full rationale is in docs/srs-v1.md. Every number the algorithm uses is here.
 *
 * Units (single canonical representation):
 *  - ReviewCard.interval : whole MINUTES
 *  - ReviewCard.ease     : integer PER-MILLE (2500 means a multiplier of 2.5), so no floating-point drift
 *  - ReviewCard.due      : epoch milliseconds (UTC instant)
 */
export const SRS_ALGORITHM_VERSION = 'srs-v1';

export const MS_PER_MINUTE = 60_000;
export const MINUTES_PER_DAY = 1_440;
export const PER_MILLE = 1_000;

/**
 * Learning steps for a new card: a retest in the same session-day, then one the next day.
 * The step a LEARNING card is on is recovered from its interval (no extra stored field).
 */
export const LEARNING_STEPS_MINUTES: readonly number[] = [10, 1 * MINUTES_PER_DAY];
/** After a lapse the card gets one short retest before returning to REVIEW. */
export const RELEARNING_STEPS_MINUTES: readonly number[] = [10];

/** Passing the last learning step (GOOD) graduates to REVIEW at this interval. */
export const GRADUATING_INTERVAL_DAYS = 3;
/** EASY during learning skips the remaining steps and graduates at this interval. */
export const EASY_GRADUATING_INTERVAL_DAYS = 7;
/** After relearning, GOOD returns the card to REVIEW at the minimum interval (a lapse resets progress). */
export const LAPSE_GRADUATING_INTERVAL_DAYS = 1;

export const MIN_REVIEW_INTERVAL_DAYS = 1;
/** The N5 syllabus is small; a year is a sensible ceiling and keeps old cards from vanishing. */
export const MAX_REVIEW_INTERVAL_DAYS = 365;

export const INITIAL_EASE = 2_500;
export const MIN_EASE = 1_300;
export const MAX_EASE = 3_500;
export const EASE_DELTA_AGAIN = -200; // applied once, at the lapse (REVIEW/MASTERED -> RELEARNING)
export const EASE_DELTA_HARD = -150;
export const EASE_DELTA_GOOD = 0;
export const EASE_DELTA_EASY = 150;

/** HARD grows the interval a little (x1.2) so a struggling card is still spaced out. */
export const HARD_INTERVAL_MULTIPLIER = 1_200;
/** EASY multiplies the GOOD result by a further x1.3. */
export const EASY_BONUS_MULTIPLIER = 1_300;

/** A REVIEW card whose scheduled interval reaches this many days is MASTERED. */
export const MASTERY_INTERVAL_DAYS = 21;
