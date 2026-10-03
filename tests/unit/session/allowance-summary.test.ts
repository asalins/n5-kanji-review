import { describe, expect, it } from 'vitest';
import { computeAllowance } from '../../../src/services/session/allowance';
import { DEFAULT_DAILY_NEW_LIMIT, DEFAULT_DAILY_REVIEW_LIMIT } from '../../../src/services/session/config';
import { summarizeSession, toStoredSummary } from '../../../src/services/session/summary';
import { ValidationError } from '../../../src/utils/errors';
import { logAt } from '../../helpers/sessionFixtures';

const logs = (reviews: number, introduced: number) => [
  ...Array.from({ length: reviews }, (_, i) => logAt(i, 1, 'REVIEW')),
  ...Array.from({ length: introduced }, (_, i) => logAt(1_000 + i, 1, 'NEW')),
];
const limits = { newCards: DEFAULT_DAILY_NEW_LIMIT, reviews: DEFAULT_DAILY_REVIEW_LIMIT };

describe('daily defaults are centralized constants', () => {
  it('are 10 new and 20 reviews', () => {
    expect([DEFAULT_DAILY_NEW_LIMIT, DEFAULT_DAILY_REVIEW_LIMIT]).toEqual([10, 20]);
  });
});

describe('review allowance', () => {
  it.each([
    [0, 20, 'nothing done'],
    [19, 1, '1 remaining'],
    [20, 0, 'exactly full'],
    [27, 0, 'over the limit never goes negative'],
  ])('%i reviews done -> %i remaining (%s)', (done, remaining) => {
    expect(computeAllowance(logs(done, 0), limits).remainingReviews).toBe(remaining);
  });
});

describe('new-card allowance', () => {
  it.each([
    [0, 10, 'nothing introduced'],
    [9, 1, '1 remaining'],
    [10, 0, 'exactly full'],
    [14, 0, 'over the limit never goes negative'],
  ])('%i introduced -> %i remaining (%s)', (introduced, remaining) => {
    expect(computeAllowance(logs(0, introduced), limits).remainingNew).toBe(remaining);
  });

  it('the two limits are independent', () => {
    expect(computeAllowance(logs(20, 0), limits)).toMatchObject({ remainingReviews: 0, remainingNew: 10 });
    expect(computeAllowance(logs(0, 10), limits)).toMatchObject({ remainingReviews: 20, remainingNew: 0 });
  });

  it('rejects invalid limits', () => {
    expect(() => computeAllowance([], { newCards: -1, reviews: 1 })).toThrow(ValidationError);
    expect(() => computeAllowance([], { newCards: 1, reviews: 1.5 })).toThrow(ValidationError);
  });
});

describe('session summary', () => {
  const r = (rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY', durationMs: number) => ({ rating, durationMs });

  it('counts, accuracy (HARD+GOOD+EASY are correct, AGAIN incorrect) and duration come from real results', () => {
    const summary = summarizeSession(6, [r('AGAIN', 1_000), r('HARD', 2_000), r('GOOD', 3_000), r('GOOD', 4_000), r('EASY', 500)]);
    expect(summary).toEqual({ total: 6, completed: 5, again: 1, hard: 1, good: 2, easy: 1, accuracy: 0.8, durationMs: 10_500 });
    expect(toStoredSummary(summary)).toEqual({ reviewedCount: 5, correctCount: 4, incorrectCount: 1 });
  });

  it('a session with no completed review has no accuracy and no fake values', () => {
    expect(summarizeSession(4, [])).toEqual({ total: 4, completed: 0, again: 0, hard: 0, good: 0, easy: 0, accuracy: null, durationMs: 0 });
  });
});
