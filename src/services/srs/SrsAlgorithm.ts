import type { ReviewCard, ReviewRating } from '../../types/entities';

/**
 * Boundary only. The algorithm (steps, intervals, ease, states) is decided in Phase 5.
 * Implementations must be pure: no React, no repositories; `now` is passed in for testability.
 */
export interface SrsAlgorithm {
  updateCardState(card: ReviewCard, rating: ReviewRating, now: Date): ReviewCard;
}
