import type { ItemRef, ReviewRating, StudyMode } from '../../types/entities';

/** The user's intent for one answered card. Carries no scheduling values: those are Phase 5. */
export interface ReviewRequest {
  readonly item: ItemRef;
  readonly mode: StudyMode;
  readonly rating: ReviewRating;
  /** Epoch ms when the rating was given. */
  readonly answeredAt: number;
  /** Whole milliseconds the card was on screen, measured by the session layer (SRS never invents it). */
  readonly durationMs: number;
}

/**
 * Boundary between the flashcard UI and the review/SRS layer.
 * Phase 5 provides an implementation that calls the SRS service and ReviewRepository.
 */
export interface ReviewOrchestrator {
  submit(request: ReviewRequest): Promise<void>;
}

/**
 * Practice-only implementation: persists NOTHING and schedules nothing. The session keeps the ratings in
 * memory for its summary. It stays the default until the atomic review write (ReviewRecorder.recordReview)
 * exists in the repository layer; then the app passes createReviewOrchestrator(...) instead.
 */
export const sessionOnlyOrchestrator: ReviewOrchestrator = {
  submit: () => Promise.resolve(),
};
