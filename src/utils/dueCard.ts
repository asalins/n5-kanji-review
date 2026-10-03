import type { ReviewCard } from '../types/entities';

/**
 * THE definition of "due", shared by the repository query (`getDueCards`, used by the review session) and by
 * the dashboard statistics, so the two can never disagree:
 *
 *   due  =  state is not NEW  AND  due time <= now
 *
 * LEARNING, REVIEW, RELEARNING and MASTERED cards can be due; NEW cards never are (they are "new", not "due").
 * Pure: `nowMs` is passed in (epoch ms), never read from the clock here.
 */
export function isDueCard(card: Pick<ReviewCard, 'state' | 'due'>, nowMs: number): boolean {
  return card.state !== 'NEW' && card.due <= nowMs;
}
