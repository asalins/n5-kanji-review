import { computeAllowance, type DailyLimits } from '../session/allowance';
import type { ReviewLog } from '../../types/entities';
import { calculateAccuracy, isCorrectRating } from './accuracy';

export interface DailyProgress {
  /** All successfully stored reviews today (never shown as "x / limit"). */
  readonly reviewsToday: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly accuracy: number | null;
  /** Reviews of already-introduced cards (stateBefore is not NEW): the only ones that use the review quota. */
  readonly reviewQuotaUsed: number;
  readonly reviewQuotaLimit: number;
  /** First reviews of new cards (stateBefore is NEW): they use the new-card quota. */
  readonly newCardsStudied: number;
  readonly newCardLimit: number;
  readonly remainingNewQuota: number;
}

/** Pure. `logsToday` must already be limited to today's local calendar day. Quota rules come from Phase 6. */
export function calculateDailyProgress(logsToday: readonly ReviewLog[], limits: DailyLimits): DailyProgress {
  const allowance = computeAllowance(logsToday, limits);
  const correct = logsToday.filter((log) => isCorrectRating(log.rating)).length;
  const incorrect = logsToday.length - correct;
  return {
    reviewsToday: logsToday.length,
    correct,
    incorrect,
    accuracy: calculateAccuracy(correct, incorrect),
    reviewQuotaUsed: allowance.reviewsDone,
    reviewQuotaLimit: limits.reviews,
    newCardsStudied: allowance.newIntroduced,
    newCardLimit: limits.newCards,
    remainingNewQuota: allowance.remainingNew,
  };
}

/** New cards the user can start today: the remaining quota, capped by cards that are still unreviewed. */
export function calculateNewAvailable(remainingNewQuota: number, unreviewedCards: number): number {
  return Math.max(0, Math.min(remainingNewQuota, unreviewedCards));
}
