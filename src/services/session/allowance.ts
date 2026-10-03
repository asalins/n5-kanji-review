import type { ReviewLog } from '../../types/entities';
import { ValidationError } from '../../utils/errors';

export interface DailyLimits {
  readonly newCards: number;
  readonly reviews: number;
}

export interface DailyAllowance {
  /** Successful reviews today of cards that were already introduced. */
  readonly reviewsDone: number;
  /** Cards introduced today: their first successful review (stateBefore NEW) was stored today. */
  readonly newIntroduced: number;
  readonly remainingReviews: number;
  readonly remainingNew: number;
}

function assertLimit(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${name} must be a non-negative integer, got ${String(value)}`);
  }
}

/**
 * Pure. Counts come only from ReviewLogs that were persisted (a failed review writes no log, so it never
 * consumes a slot). A card is "introduced" by its first stored review, not by being selected or created.
 */
export function computeAllowance(logsToday: readonly ReviewLog[], limits: DailyLimits): DailyAllowance {
  assertLimit('new card limit', limits.newCards);
  assertLimit('review limit', limits.reviews);
  const newIntroduced = logsToday.filter((log) => log.stateBefore === 'NEW').length;
  const reviewsDone = logsToday.length - newIntroduced;
  return {
    reviewsDone,
    newIntroduced,
    remainingReviews: Math.max(0, limits.reviews - reviewsDone),
    remainingNew: Math.max(0, limits.newCards - newIntroduced),
  };
}
