import type { ItemRef, ReviewRating, StudyMode } from '../../types/entities';

/** The user's intent for one answered card. Carries no scheduling values: those are Phase 5. */
export interface ReviewRequest {
  readonly item: ItemRef;
  readonly mode: StudyMode;
  readonly rating: ReviewRating;
  readonly answeredAt: number;
}

/**
 * Boundary between the flashcard UI and the review/SRS layer.
 * Phase 5 provides an implementation that calls the SRS service and ReviewRepository.
 */
export interface ReviewOrchestrator {
  submit(request: ReviewRequest): Promise<void>;
}

/**
 * Phase 4 implementation: persists NOTHING and schedules nothing. The session itself keeps the
 * ratings in memory for its summary. Replaced in Phase 5.
 */
export const sessionOnlyOrchestrator: ReviewOrchestrator = {
  submit: () => Promise.resolve(),
};
