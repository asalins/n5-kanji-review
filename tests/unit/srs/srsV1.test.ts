import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EASY_GRADUATING_INTERVAL_DAYS,
  GRADUATING_INTERVAL_DAYS,
  INITIAL_EASE,
  LAPSE_GRADUATING_INTERVAL_DAYS,
  MASTERY_INTERVAL_DAYS,
  MAX_EASE,
  MAX_REVIEW_INTERVAL_DAYS,
  MIN_EASE,
  MINUTES_PER_DAY,
  MS_PER_MINUTE,
  SRS_ALGORITHM_VERSION,
  createNewCard,
  srsV1,
  updateCardState,
} from '../../../src/services/srs';
import { LEARNING_STATES, REVIEW_RATINGS, type LearningState, type ReviewCard, type ReviewRating } from '../../../src/types/entities';
import { reviewCardSchema } from '../../../src/types/schemas';
import { ValidationError } from '../../../src/utils/errors';

const NOW = 1_800_000_000_000;
const DAY = MINUTES_PER_DAY;
const ITEM = { itemType: 'kanji', itemId: 'kanji:U+6C34' } as const;
const fresh = (now = NOW) => createNewCard(ITEM, 'A', now);
const card = (over: Partial<ReviewCard>): ReviewCard => ({ ...fresh(), ...over });
const step = (c: ReviewCard, ...ratings: ReviewRating[]): ReviewCard =>
  ratings.reduce((current, rating, i) => updateCardState(current, rating, NOW + (i + 1) * 1_000).card, c);
/** Result of one rating on `c`, summarised as [state, interval-in-minutes, ease]. */
const outcome = (c: ReviewCard, rating: ReviewRating) => {
  const r = updateCardState(c, rating, NOW).card;
  return [r.state, r.interval, r.ease] as const;
};
const review = (days: number, ease = INITIAL_EASE, state: LearningState = 'REVIEW') =>
  card({ state, interval: days * DAY, ease, algorithmVersion: SRS_ALGORITHM_VERSION, reviewCount: 5, correctCount: 5 });

describe('new card', () => {
  it('starts NEW with documented initial values and an explicit algorithm version', () => {
    expect(fresh()).toEqual({
      id: 'kanji:kanji:U+6C34:A',
      itemType: 'kanji',
      itemId: 'kanji:U+6C34',
      mode: 'A',
      state: 'NEW',
      interval: 0,
      ease: INITIAL_EASE,
      due: NOW, // due = creation time; NEW cards are excluded from due queries by state
      reviewCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      lastReviewed: null,
      algorithmVersion: 'srs-v1',
    });
    expect(reviewCardSchema.safeParse(fresh()).success).toBe(true);
  });
  it('different modes are different cards', () => {
    expect(createNewCard(ITEM, 'C', NOW).id).not.toBe(createNewCard(ITEM, 'A', NOW).id);
  });
});

describe('NEW', () => {
  it.each([
    ['AGAIN', 'LEARNING', 10],
    ['HARD', 'LEARNING', 10],
    ['GOOD', 'LEARNING', DAY],
    ['EASY', 'REVIEW', EASY_GRADUATING_INTERVAL_DAYS * DAY],
  ] as const)('%s -> %s, interval %i min', (rating, state, interval) => {
    expect(outcome(fresh(), rating)).toEqual([state, interval, INITIAL_EASE]);
  });
});

describe('LEARNING', () => {
  const step0 = () => step(fresh(), 'AGAIN'); // interval 10
  const step1 = () => step(fresh(), 'GOOD'); // interval 1 day
  it('step 0: AGAIN/HARD repeat 10 min, GOOD moves to the 1-day step, EASY graduates', () => {
    expect(outcome(step0(), 'AGAIN')).toEqual(['LEARNING', 10, INITIAL_EASE]);
    expect(outcome(step0(), 'HARD')).toEqual(['LEARNING', 10, INITIAL_EASE]);
    expect(outcome(step0(), 'GOOD')).toEqual(['LEARNING', DAY, INITIAL_EASE]);
    expect(outcome(step0(), 'EASY')).toEqual(['REVIEW', 7 * DAY, INITIAL_EASE]);
  });
  it('last step: AGAIN restarts, HARD repeats, GOOD graduates at 3 days, EASY at 7 days', () => {
    expect(outcome(step1(), 'AGAIN')).toEqual(['LEARNING', 10, INITIAL_EASE]);
    expect(outcome(step1(), 'HARD')).toEqual(['LEARNING', DAY, INITIAL_EASE]);
    expect(outcome(step1(), 'GOOD')).toEqual(['REVIEW', GRADUATING_INTERVAL_DAYS * DAY, INITIAL_EASE]);
    expect(outcome(step1(), 'EASY')).toEqual(['REVIEW', EASY_GRADUATING_INTERVAL_DAYS * DAY, INITIAL_EASE]);
  });
  it('graduation never changes ease', () => {
    expect(step(fresh(), 'GOOD', 'GOOD').ease).toBe(INITIAL_EASE);
  });
});

describe('REVIEW (interval 3 days, ease 2500)', () => {
  const c = () => review(3);
  it('AGAIN lapses to RELEARNING at 10 min and lowers ease by 200', () => {
    expect(outcome(c(), 'AGAIN')).toEqual(['RELEARNING', 10, 2300]);
  });
  it('HARD: x1.2 -> 4 days, ease -150', () => {
    expect(outcome(c(), 'HARD')).toEqual(['REVIEW', 4 * DAY, 2350]);
  });
  it('GOOD: x2.5 -> 8 days, ease unchanged', () => {
    expect(outcome(c(), 'GOOD')).toEqual(['REVIEW', 8 * DAY, 2500]); // 7.5 rounds half up
  });
  it('EASY: x2.5 x1.3 -> 10 days, ease +150', () => {
    expect(outcome(c(), 'EASY')).toEqual(['REVIEW', 10 * DAY, 2650]);
  });
  it('rated intervals are strictly ordered: HARD < GOOD < EASY (and HARD never shrinks)', () => {
    for (const days of [1, 2, 3, 10, 50, 200]) {
      const [h, g, e] = (['HARD', 'GOOD', 'EASY'] as const).map((r) => outcome(review(days), r)[1]);
      expect(h).toBeGreaterThanOrEqual(days * DAY);
      expect(g!).toBeGreaterThanOrEqual(h!);
      expect(e!).toBeGreaterThanOrEqual(g!);
    }
  });
});

describe('RELEARNING', () => {
  const lapsed = () => step(review(10), 'AGAIN');
  it('is entered with the lowered ease and a 10-minute step', () => {
    expect(lapsed()).toMatchObject({ state: 'RELEARNING', interval: 10, ease: 2300 });
  });
  it('AGAIN and HARD repeat the step without lowering ease again', () => {
    expect(outcome(lapsed(), 'AGAIN')).toEqual(['RELEARNING', 10, 2300]);
    expect(outcome(lapsed(), 'HARD')).toEqual(['RELEARNING', 10, 2300]);
  });
  it('GOOD returns to REVIEW at 1 day; EASY at 3 days; interval history is reset', () => {
    expect(outcome(lapsed(), 'GOOD')).toEqual(['REVIEW', LAPSE_GRADUATING_INTERVAL_DAYS * DAY, 2300]);
    expect(outcome(lapsed(), 'EASY')).toEqual(['REVIEW', GRADUATING_INTERVAL_DAYS * DAY, 2300]);
  });
});

describe('MASTERED', () => {
  it('a REVIEW card becomes MASTERED once its interval reaches 21 days, and not before', () => {
    expect(outcome(review(8), 'GOOD')).toEqual(['REVIEW', 20 * DAY, 2500]); // 8 * 2.5 = 20 days
    expect(outcome(review(9), 'GOOD')[0]).toBe('MASTERED'); // 22.5 -> 23 days
    expect(MASTERY_INTERVAL_DAYS * DAY).toBe(21 * DAY);
  });
  it('exactly 21 days is MASTERED, 20 days is not', () => {
    // HARD x1.2: 17 -> 20 (20.4 -> 20) stays REVIEW; 18 -> 22 (21.6 -> 22) is MASTERED
    expect(outcome(review(17), 'HARD')[0]).toBe('REVIEW');
    expect(outcome(review(18), 'HARD')[0]).toBe('MASTERED');
  });
  it('GOOD/EASY/HARD keep a MASTERED card MASTERED and never shrink it', () => {
    for (const rating of ['HARD', 'GOOD', 'EASY'] as const) {
      const [state, interval] = outcome(review(30, INITIAL_EASE, 'MASTERED'), rating);
      expect(state).toBe('MASTERED');
      expect(interval).toBeGreaterThanOrEqual(30 * DAY);
    }
  });
  it('AGAIN lapses a MASTERED card to RELEARNING', () => {
    expect(outcome(review(30, INITIAL_EASE, 'MASTERED'), 'AGAIN')).toEqual(['RELEARNING', 10, 2300]);
  });
});

describe('due, overdue and boundaries', () => {
  it('due = now + interval minutes, exactly, and moves 1:1 with now (+/- 1 ms)', () => {
    const base = updateCardState(fresh(), 'GOOD', NOW).card;
    expect(base.due).toBe(NOW + DAY * MS_PER_MINUTE);
    expect(updateCardState(fresh(), 'GOOD', NOW + 1).card.due).toBe(base.due + 1);
    expect(updateCardState(fresh(), 'GOOD', NOW - 1).card.due).toBe(base.due - 1);
  });
  it('overdue time does not change the interval (due is ignored, growth starts from the scheduled interval)', () => {
    const onTime = card({ ...review(3), due: NOW });
    const veryLate = card({ ...review(3), due: NOW - 400 * DAY * MS_PER_MINUTE });
    expect(updateCardState(onTime, 'GOOD', NOW).card.interval).toBe(updateCardState(veryLate, 'GOOD', NOW).card.interval);
    expect(updateCardState(veryLate, 'GOOD', NOW).card.due).toBe(NOW + 8 * DAY * MS_PER_MINUTE);
  });
  it('intervals never go below 1 day in REVIEW or above 365 days', () => {
    expect(outcome(review(1), 'HARD')[1]).toBe(DAY);
    expect(outcome(review(300, 3500), 'EASY')[1]).toBe(MAX_REVIEW_INTERVAL_DAYS * DAY);
    expect(outcome(card({ state: 'REVIEW', interval: 5, algorithmVersion: 'srs-v1' }), 'HARD')[1]).toBeGreaterThanOrEqual(DAY);
  });
  it('ease respects its minimum and maximum, including out-of-range input', () => {
    expect(outcome(review(5, MIN_EASE), 'HARD')[2]).toBe(MIN_EASE);
    expect(outcome(review(5, MIN_EASE), 'AGAIN')[2]).toBe(MIN_EASE);
    expect(outcome(review(5, MAX_EASE), 'EASY')[2]).toBe(MAX_EASE);
    expect(outcome(review(5, 99_999), 'GOOD')[2]).toBe(MAX_EASE);
    expect(outcome(review(5, 1), 'GOOD')[2]).toBe(MIN_EASE);
    expect(Number.isInteger(outcome(review(5, 2_500.6), 'GOOD')[2])).toBe(true);
  });
});

describe('sequences', () => {
  it('repeated AGAIN stays at the first step and never inflates ease', () => {
    const c = step(fresh(), ...Array<ReviewRating>(25).fill('AGAIN'));
    expect(c).toMatchObject({ state: 'LEARNING', interval: 10, ease: INITIAL_EASE, reviewCount: 25, incorrectCount: 25, correctCount: 0 });
  });
  it('repeated EASY grows to the cap and stops there', () => {
    let c = fresh();
    const intervals: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      c = updateCardState(c, 'EASY', NOW + i).card;
      intervals.push(c.interval);
    }
    expect(Math.max(...intervals)).toBe(MAX_REVIEW_INTERVAL_DAYS * DAY);
    expect(intervals.slice(-2)).toEqual([MAX_REVIEW_INTERVAL_DAYS * DAY, MAX_REVIEW_INTERVAL_DAYS * DAY]);
    expect(c.ease).toBe(MAX_EASE);
    expect(c.state).toBe('MASTERED');
  });
  it('repeated lapses bottom out at the minimum ease', () => {
    let c = review(10);
    for (let i = 0; i < 30; i += 1) c = step(step(c, 'AGAIN'), 'GOOD', 'GOOD');
    expect(c.ease).toBe(MIN_EASE);
  });
});

describe('determinism, immutability, invariants', () => {
  it('same card + rating + now gives identical results, many times', () => {
    const c = review(7);
    const first = JSON.stringify(updateCardState(c, 'GOOD', NOW));
    for (let i = 0; i < 200; i += 1) expect(JSON.stringify(updateCardState(c, 'GOOD', NOW))).toBe(first);
    expect(JSON.stringify(srsV1.updateCardState(c, 'GOOD', NOW))).toBe(first);
  });
  it('does not mutate the input card', () => {
    const c = Object.freeze(review(7));
    const copy = { ...c };
    const result = updateCardState(c, 'EASY', NOW);
    expect(c).toEqual(copy);
    expect(result.card).not.toBe(c);
  });
  it('is independent of the process time zone', () => {
    const original = process.env.TZ;
    const results = ['UTC', 'Asia/Bangkok', 'America/New_York', 'Pacific/Auckland'].map((tz) => {
      process.env.TZ = tz;
      return JSON.stringify(step(fresh(), 'GOOD', 'GOOD', 'GOOD', 'AGAIN', 'GOOD'));
    });
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
    expect(new Set(results).size).toBe(1);
  });

  it('keeps every invariant over 400 seeded random review sequences', () => {
    let seed = 12345;
    const random = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 4294967296;
    };
    for (let run = 0; run < 400; run += 1) {
      let c = fresh();
      let now = NOW;
      for (let i = 0; i < 40; i += 1) {
        now += Math.floor(random() * 3 * DAY * MS_PER_MINUTE);
        const rating = REVIEW_RATINGS[Math.floor(random() * 4)] as ReviewRating;
        const result = updateCardState(c, rating, now);
        const n = result.card;
        expect(reviewCardSchema.safeParse(n).success).toBe(true);
        expect(Number.isInteger(n.interval) && n.interval >= 0).toBe(true);
        expect(n.due).toBe(now + n.interval * MS_PER_MINUTE);
        expect(Number.isInteger(n.ease) && n.ease >= MIN_EASE && n.ease <= MAX_EASE).toBe(true);
        expect(n.interval).toBeLessThanOrEqual(MAX_REVIEW_INTERVAL_DAYS * DAY);
        expect(n.reviewCount).toBe(c.reviewCount + 1);
        expect(n.correctCount).toBeGreaterThanOrEqual(c.correctCount);
        expect(n.incorrectCount).toBeGreaterThanOrEqual(c.incorrectCount);
        expect(n.correctCount + n.incorrectCount).toBe(n.reviewCount);
        expect([n.id, n.itemType, n.itemId, n.mode]).toEqual([c.id, c.itemType, c.itemId, c.mode]);
        expect(n.algorithmVersion).toBe('srs-v1');
        expect(n.lastReviewed).toBe(now);
        expect(n.state).not.toBe('NEW');
        expect(LEARNING_STATES).toContain(n.state);
        expect(result.stateBefore).toBe(c.state);
        expect(result.stateAfter).toBe(n.state);
        c = n;
      }
    }
  });
});

describe('counters', () => {
  it('AGAIN is incorrect; HARD, GOOD and EASY are correct; every rating is a review', () => {
    const base = review(5);
    for (const rating of REVIEW_RATINGS) {
      const n = updateCardState(base, rating, NOW).card;
      expect(n.reviewCount).toBe(base.reviewCount + 1);
      expect(n.correctCount).toBe(base.correctCount + (rating === 'AGAIN' ? 0 : 1));
      expect(n.incorrectCount).toBe(base.incorrectCount + (rating === 'AGAIN' ? 1 : 0));
    }
  });
});

describe('guards', () => {
  it('rejects an invalid clock, an unknown rating, an unknown state and another algorithm version', () => {
    expect(() => updateCardState(fresh(), 'GOOD', Number.NaN)).toThrow(ValidationError);
    expect(() => updateCardState(fresh(), 'GOOD', -1)).toThrow(ValidationError);
    expect(() => updateCardState(fresh(), 'GOOD', 1.5)).toThrow(ValidationError);
    expect(() => createNewCard(ITEM, 'A', Number.POSITIVE_INFINITY)).toThrow(ValidationError);
    expect(() => updateCardState(fresh(), 'MAYBE' as ReviewRating, NOW)).toThrow();
    expect(() => updateCardState(card({ state: 'BOGUS' as LearningState }), 'GOOD', NOW)).toThrow();
    expect(() => updateCardState({ ...fresh(), algorithmVersion: 'srs-v2' }, 'GOOD', NOW)).toThrow(ValidationError);
    expect(() => updateCardState({ ...fresh(), algorithmVersion: '' }, 'GOOD', NOW)).toThrow(ValidationError);
  });
});

describe('purity of the SRS module', () => {
  it('has no clock, randomness, storage, UI or database access', () => {
    const dir = 'src/services/srs';
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const code = readFileSync(`${dir}/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\bDate\b|Math\.random|performance\.|localStorage|indexedDB|from ['"]idb|from ['"]react|repositories/);
    }
  });
});
