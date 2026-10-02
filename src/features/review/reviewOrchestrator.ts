import type { ReviewCard, ReviewLog } from '../../types/entities';
import { buildReviewCardId } from '../../utils/reviewCardId';
import { srsV1, type SrsAlgorithm } from '../../services/srs';
import type { ReviewOrchestrator, ReviewRequest } from './reviewBoundary';

/**
 * What the orchestrator needs from persistence: ReviewRepository satisfies it. `recordReview` stores the
 * card and the log atomically (one IndexedDB transaction), so a review is never half-saved.
 */
export interface ReviewRecorder {
  getCard(id: string): Promise<ReviewCard | null>;
  recordReview(card: ReviewCard, log: ReviewLog): Promise<void>;
}

export interface ReviewOrchestratorDeps {
  readonly recorder: ReviewRecorder;
  /** Dataset version loaded at review time (KanjiRepository.getDatasetVersion). */
  readonly getDatasetVersion: () => Promise<string | null>;
  readonly algorithm?: SrsAlgorithm;
}

/**
 * rating intent -> load card (or start a NEW one) -> SRS -> one atomic write of card + log.
 * All scheduling comes from the SRS service; this file only moves data. Any failure rejects, so the UI
 * never reports a review that was not stored.
 */
export function createReviewOrchestrator({
  recorder,
  getDatasetVersion,
  algorithm = srsV1,
}: ReviewOrchestratorDeps): ReviewOrchestrator {
  return {
    async submit(request: ReviewRequest): Promise<void> {
      const id = buildReviewCardId(request.item.itemType, request.item.itemId, request.mode);
      const existing = await recorder.getCard(id);
      const before = existing ?? algorithm.createNewCard(request.item, request.mode, request.answeredAt);
      const result = algorithm.updateCardState(before, request.rating, request.answeredAt);
      const log: ReviewLog = {
        // unique per card because reviewCount only grows; the repository adds (never overwrites) logs
        id: `${result.card.id}#${result.card.reviewCount}`,
        cardId: result.card.id,
        rating: request.rating,
        reviewedAt: request.answeredAt,
        durationMs: request.durationMs,
        stateBefore: result.stateBefore,
        stateAfter: result.stateAfter,
        datasetVersion: await getDatasetVersion(),
      };
      await recorder.recordReview(result.card, log);
    },
  };
}
