import { describe, expect, it } from 'vitest';
import * as constants from '../../../src/services/srs/constants';
import { srsV1 } from '../../../src/services/srs';
import type { ReviewCard, ReviewRating } from '../../../src/types/entities';

/**
 * The approved srs-v1 policy (docs/srs-v1.md), written as LITERAL numbers on purpose. The behaviour tests in
 * srsV1.test.ts are expressed through the constants, so they cannot notice a changed constant; these can.
 * Changing any value here means a new algorithm version (srs-v2), not an edit of srs-v1.
 */
describe('srs-v1 approved parameters are locked', () => {
  it('every parameter has its approved value', () => {
    expect({
      version: constants.SRS_ALGORITHM_VERSION,
      learningSteps: constants.LEARNING_STEPS_MINUTES,
      relearningSteps: constants.RELEARNING_STEPS_MINUTES,
      graduating: constants.GRADUATING_INTERVAL_DAYS,
      easyGraduating: constants.EASY_GRADUATING_INTERVAL_DAYS,
      lapseGraduating: constants.LAPSE_GRADUATING_INTERVAL_DAYS,
      minReview: constants.MIN_REVIEW_INTERVAL_DAYS,
      maxReview: constants.MAX_REVIEW_INTERVAL_DAYS,
      ease: [constants.INITIAL_EASE, constants.MIN_EASE, constants.MAX_EASE],
      easeDeltas: [constants.EASE_DELTA_AGAIN, constants.EASE_DELTA_HARD, constants.EASE_DELTA_GOOD, constants.EASE_DELTA_EASY],
      multipliers: [constants.HARD_INTERVAL_MULTIPLIER, constants.EASY_BONUS_MULTIPLIER],
      mastery: constants.MASTERY_INTERVAL_DAYS,
    }).toEqual({
      version: 'srs-v1',
      learningSteps: [10, 1_440],
      relearningSteps: [10],
      graduating: 3,
      easyGraduating: 7,
      lapseGraduating: 1,
      minReview: 1,
      maxReview: 365,
      ease: [2_500, 1_300, 3_500],
      easeDeltas: [-200, -150, 0, 150],
      multipliers: [1_200, 1_300],
      mastery: 21,
    });
  });
});

describe('srs-v1 schedules, in literal minutes (docs/srs-v1.md examples)', () => {
  const NOW = 1_800_000_000_000;
  const DAY = 1_440;
  const start = () => srsV1.createNewCard({ itemType: 'kanji', itemId: 'kanji:U+6C34' }, 'A', NOW);
  const after = (card: ReviewCard, ...ratings: ReviewRating[]) =>
    ratings.reduce((c, rating, i) => srsV1.updateCardState(c, rating, NOW + i * 60_000).card, card);
  const view = (card: ReviewCard) => [card.state, card.interval, card.ease];

  it('NEW: AGAIN 10 min, HARD 10 min, GOOD 1 day, EASY 7 days', () => {
    expect(view(after(start(), 'AGAIN'))).toEqual(['LEARNING', 10, 2_500]);
    expect(view(after(start(), 'HARD'))).toEqual(['LEARNING', 10, 2_500]);
    expect(view(after(start(), 'GOOD'))).toEqual(['LEARNING', DAY, 2_500]);
    expect(view(after(start(), 'EASY'))).toEqual(['REVIEW', 7 * DAY, 2_500]);
  });

  it('GOOD, GOOD graduates to REVIEW at 3 days; then GOOD = 8 days (round(3 x 2.5))', () => {
    expect(view(after(start(), 'GOOD', 'GOOD'))).toEqual(['REVIEW', 3 * DAY, 2_500]);
    expect(view(after(start(), 'GOOD', 'GOOD', 'GOOD'))).toEqual(['REVIEW', 8 * DAY, 2_500]);
  });

  it('REVIEW at 3 days: HARD 4 d / 2350, EASY 10 d / 2650; AGAIN lapses to 10 min / 2300, then GOOD 1 day', () => {
    const review3 = after(start(), 'GOOD', 'GOOD');
    expect(view(after(review3, 'HARD'))).toEqual(['REVIEW', 4 * DAY, 2_350]);
    expect(view(after(review3, 'EASY'))).toEqual(['REVIEW', 10 * DAY, 2_650]);
    expect(view(after(review3, 'AGAIN'))).toEqual(['RELEARNING', 10, 2_300]);
    expect(view(after(review3, 'AGAIN', 'GOOD'))).toEqual(['REVIEW', DAY, 2_300]);
  });

  it('becomes MASTERED once the interval reaches 21 days and never exceeds 365 days', () => {
    const mastered = after(start(), 'EASY', 'GOOD'); // 7 d -> round(7 x 2.5) = 18 d
    expect(view(mastered)).toEqual(['REVIEW', 18 * DAY, 2_500]);
    expect(after(mastered, 'GOOD').state).toBe('MASTERED'); // 45 d
    let card = mastered;
    for (let i = 0; i < 20; i += 1) card = after(card, 'EASY');
    expect(card.interval).toBe(365 * DAY);
    expect(card.ease).toBe(3_500);
  });
});
