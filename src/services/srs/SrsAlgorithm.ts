import type { ItemRef, LearningState, ReviewCard, ReviewRating, StudyMode } from '../../types/entities';

/** What one review changed. The orchestrator persists `card` and builds the ReviewLog from the states. */
export interface SrsResult {
  readonly card: ReviewCard;
  readonly stateBefore: LearningState;
  readonly stateAfter: LearningState;
}

/**
 * The scheduling boundary. Implementations are pure: no React, no repositories, no clock.
 * `now` is epoch milliseconds, always passed in, so the same inputs give the same result.
 */
export interface SrsAlgorithm {
  /** Written to ReviewCard.algorithmVersion. A card is only processed by the version that made it. */
  readonly version: string;
  createNewCard(item: ItemRef, mode: StudyMode, now: number): ReviewCard;
  updateCardState(card: ReviewCard, rating: ReviewRating, now: number): SrsResult;
}
