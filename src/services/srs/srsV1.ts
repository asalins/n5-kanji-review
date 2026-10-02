import type { ItemRef, LearningState, ReviewCard, ReviewRating, StudyMode } from '../../types/entities';
import { assertNever } from '../../utils/assertNever';
import { ValidationError } from '../../utils/errors';
import { buildReviewCardId } from '../../utils/reviewCardId';
import { clamp, daysToMinutes, minutesToDays, roundDiv, stepIndexFor } from './calculations';
import {
  EASE_DELTA_AGAIN,
  EASE_DELTA_EASY,
  EASE_DELTA_GOOD,
  EASE_DELTA_HARD,
  EASY_BONUS_MULTIPLIER,
  EASY_GRADUATING_INTERVAL_DAYS,
  GRADUATING_INTERVAL_DAYS,
  HARD_INTERVAL_MULTIPLIER,
  INITIAL_EASE,
  LAPSE_GRADUATING_INTERVAL_DAYS,
  LEARNING_STEPS_MINUTES,
  MASTERY_INTERVAL_DAYS,
  MAX_EASE,
  MAX_REVIEW_INTERVAL_DAYS,
  MIN_EASE,
  MIN_REVIEW_INTERVAL_DAYS,
  MS_PER_MINUTE,
  PER_MILLE,
  RELEARNING_STEPS_MINUTES,
  SRS_ALGORITHM_VERSION,
} from './constants';
import type { SrsAlgorithm, SrsResult } from './SrsAlgorithm';

interface Scheduling {
  readonly state: LearningState;
  readonly interval: number; // minutes
  readonly ease: number; // per-mille
}

const normalizeEase = (ease: number): number => clamp(Math.round(ease), MIN_EASE, MAX_EASE);

/** REVIEW below the mastery interval, MASTERED at or above it. */
function reviewStateFor(intervalMinutes: number): LearningState {
  return intervalMinutes >= daysToMinutes(MASTERY_INTERVAL_DAYS) ? 'MASTERED' : 'REVIEW';
}

const graduate = (days: number, ease: number): Scheduling => {
  const interval = daysToMinutes(clamp(days, MIN_REVIEW_INTERVAL_DAYS, MAX_REVIEW_INTERVAL_DAYS));
  return { state: reviewStateFor(interval), interval, ease };
};

/** NEW, LEARNING and RELEARNING: walk through the steps; graduate to REVIEW after the last one. */
function scheduleStepped(
  card: ReviewCard,
  rating: ReviewRating,
  steps: readonly number[],
  goodGraduationDays: number,
  easyGraduationDays: number,
): Scheduling {
  const ease = normalizeEase(card.ease);
  const stay = (index: number): Scheduling => ({
    state: card.state === 'RELEARNING' ? 'RELEARNING' : 'LEARNING',
    interval: steps[index] as number,
    ease,
  });
  const index = stepIndexFor(steps, card.interval);
  switch (rating) {
    case 'AGAIN':
      return stay(0);
    case 'HARD':
      return stay(index);
    case 'GOOD':
      return index + 1 < steps.length ? stay(index + 1) : graduate(goodGraduationDays, ease);
    case 'EASY':
      return graduate(easyGraduationDays, ease);
    default:
      return assertNever(rating);
  }
}

/** REVIEW and MASTERED: grow the interval from the current one, or lapse into RELEARNING. */
function scheduleReview(card: ReviewCard, rating: ReviewRating): Scheduling {
  const ease = normalizeEase(card.ease);
  if (rating === 'AGAIN') {
    return {
      state: 'RELEARNING',
      interval: RELEARNING_STEPS_MINUTES[0] as number,
      ease: normalizeEase(ease + EASE_DELTA_AGAIN),
    };
  }
  // Overdue time is deliberately ignored: growth starts from the SCHEDULED interval, not the elapsed time.
  const previousDays = clamp(minutesToDays(card.interval), MIN_REVIEW_INTERVAL_DAYS, MAX_REVIEW_INTERVAL_DAYS);
  // Intervals use the card's ease BEFORE this review's adjustment.
  const hardDays = Math.max(previousDays, roundDiv(previousDays * HARD_INTERVAL_MULTIPLIER, PER_MILLE));
  const goodDays = Math.max(hardDays + 1, roundDiv(previousDays * ease, PER_MILLE));
  const easyDays = Math.max(goodDays + 1, roundDiv(previousDays * ease * EASY_BONUS_MULTIPLIER, PER_MILLE * PER_MILLE));
  const pick = (days: number, delta: number): Scheduling => graduate(days, normalizeEase(ease + delta));
  switch (rating) {
    case 'HARD':
      return pick(hardDays, EASE_DELTA_HARD);
    case 'GOOD':
      return pick(goodDays, EASE_DELTA_GOOD);
    case 'EASY':
      return pick(easyDays, EASE_DELTA_EASY);
    default:
      return assertNever(rating);
  }
}

function schedule(card: ReviewCard, rating: ReviewRating): Scheduling {
  switch (card.state) {
    case 'NEW':
    case 'LEARNING':
      return scheduleStepped(card, rating, LEARNING_STEPS_MINUTES, GRADUATING_INTERVAL_DAYS, EASY_GRADUATING_INTERVAL_DAYS);
    case 'RELEARNING':
      return scheduleStepped(card, rating, RELEARNING_STEPS_MINUTES, LAPSE_GRADUATING_INTERVAL_DAYS, GRADUATING_INTERVAL_DAYS);
    case 'REVIEW':
    case 'MASTERED':
      return scheduleReview(card, rating);
    default:
      return assertNever(card.state);
  }
}

function assertValidNow(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new ValidationError(`now must be a non-negative integer (epoch ms), got ${String(now)}`);
  }
}

/** A NEW card: never reviewed. `due` is its creation time (it is excluded from due queries by state). */
export function createNewCard(item: ItemRef, mode: StudyMode, now: number): ReviewCard {
  assertValidNow(now);
  return {
    id: buildReviewCardId(item.itemType, item.itemId, mode),
    itemType: item.itemType,
    itemId: item.itemId,
    mode,
    state: 'NEW',
    interval: 0,
    ease: INITIAL_EASE,
    due: now,
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    lastReviewed: null,
    algorithmVersion: SRS_ALGORITHM_VERSION,
  };
}

/** Applies one rating. Pure: returns a new card and never mutates its input. */
export function updateCardState(card: ReviewCard, rating: ReviewRating, now: number): SrsResult {
  assertValidNow(now);
  if (card.algorithmVersion !== SRS_ALGORITHM_VERSION) {
    throw new ValidationError(
      `Card was scheduled by "${card.algorithmVersion}", not "${SRS_ALGORITHM_VERSION}"; it is not reinterpreted`,
    );
  }
  const next = schedule(card, rating);
  const correct = rating !== 'AGAIN'; // AGAIN is incorrect; HARD, GOOD and EASY all count as recalled
  return {
    stateBefore: card.state,
    stateAfter: next.state,
    card: {
      ...card,
      state: next.state,
      interval: next.interval,
      ease: next.ease,
      due: now + next.interval * MS_PER_MINUTE,
      reviewCount: card.reviewCount + 1,
      correctCount: card.correctCount + (correct ? 1 : 0),
      incorrectCount: card.incorrectCount + (correct ? 0 : 1),
      lastReviewed: now,
      algorithmVersion: SRS_ALGORITHM_VERSION,
    },
  };
}

export const srsV1: SrsAlgorithm = {
  version: SRS_ALGORITHM_VERSION,
  createNewCard,
  updateCardState,
};
