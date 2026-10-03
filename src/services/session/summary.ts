import type { ReviewRating, StudySessionSummary } from '../../types/entities';

export interface CardResult {
  readonly rating: ReviewRating;
  readonly durationMs: number;
}

export interface SessionSummary {
  /** Cards the session planned to show. */
  readonly total: number;
  /** Reviews that were stored successfully. */
  readonly completed: number;
  readonly again: number;
  readonly hard: number;
  readonly good: number;
  readonly easy: number;
  /** (HARD + GOOD + EASY) / completed, 0..1; null when nothing was completed. Phase 5 definition. */
  readonly accuracy: number | null;
  /** Sum of the time spent on the stored cards (the measured durationMs values). */
  readonly durationMs: number;
}

/** Pure: computed only from results of reviews that were stored. */
export function summarizeSession(total: number, results: readonly CardResult[]): SessionSummary {
  const count = (rating: ReviewRating): number => results.filter((r) => r.rating === rating).length;
  const again = count('AGAIN');
  const completed = results.length;
  return {
    total,
    completed,
    again,
    hard: count('HARD'),
    good: count('GOOD'),
    easy: count('EASY'),
    accuracy: completed === 0 ? null : (completed - again) / completed,
    durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
  };
}

/** The persisted StudySession.summary (existing entity shape; nothing is added to it). */
export function toStoredSummary(summary: SessionSummary): StudySessionSummary {
  return {
    reviewedCount: summary.completed,
    correctCount: summary.completed - summary.again,
    incorrectCount: summary.again,
  };
}
