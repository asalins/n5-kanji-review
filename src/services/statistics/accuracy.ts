import type { ReviewRating } from '../../types/entities';

/** Phase 5 definition, the single source: AGAIN is incorrect; HARD, GOOD and EASY are correct. */
export function isCorrectRating(rating: ReviewRating): boolean {
  return rating !== 'AGAIN';
}

/** correct / (correct + incorrect) as a ratio 0..1, or null when nothing was reviewed (no reviews is not 0%). */
export function calculateAccuracy(correct: number, incorrect: number): number | null {
  const completed = correct + incorrect;
  return completed === 0 ? null : correct / completed;
}

/** Part / total as a percentage 0..100, or null when the total is not positive. Never exceeds 100. */
export function calculateProgressPercentage(part: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.min(100, (Math.max(0, part) / total) * 100);
}
