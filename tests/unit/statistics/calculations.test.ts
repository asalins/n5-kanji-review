import { afterEach, describe, expect, it } from 'vitest';
import { calculateAccuracy, calculateProgressPercentage } from '../../../src/services/statistics/accuracy';
import { calculateDailyProgress, calculateNewAvailable } from '../../../src/services/statistics/dailyProgress';
import { dayNumber, keyFromDayNumber, localDateKey } from '../../../src/services/statistics/days';
import { aggregateReviewsByDay, keyLogs, logsInLastDays, summarizeLogs } from '../../../src/services/statistics/history';
import { calculateLearnedKanji, calculateMasteredKanji, countCardsByState } from '../../../src/services/statistics/kanjiProgress';
import { calculateLongestStreak, calculateStreak } from '../../../src/services/statistics/streak';
import { LEARNING_STATES, type LearningState, type ReviewRating } from '../../../src/types/entities';
import { logAt, storedCard } from '../../helpers/sessionFixtures';

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const rated = (ratings: ReviewRating[], before: LearningState = 'REVIEW', at = new Date(2026, 9, 3, 12).getTime()) =>
  ratings.map((rating, i) => logAt(i, at + i, before, { rating }));
const set = (...keys: string[]) => new Set(keys);

describe('accuracy = (HARD + GOOD + EASY) / completed; no reviews is "no value", never 0%', () => {
  it('0 reviews -> null', () => expect(calculateAccuracy(0, 0)).toBeNull());
  it('1 AGAIN -> 0', () => expect(summarizeLogs(rated(['AGAIN'])).accuracy).toBe(0));
  it('1 GOOD -> 1', () => expect(summarizeLogs(rated(['GOOD'])).accuracy).toBe(1));
  it('10 reviews: 2 AGAIN, 1 HARD, 5 GOOD, 2 EASY -> 8 correct, 2 incorrect, 80%', () => {
    const s = summarizeLogs(rated(['AGAIN', 'AGAIN', 'HARD', 'GOOD', 'GOOD', 'GOOD', 'GOOD', 'GOOD', 'EASY', 'EASY']));
    expect(s).toEqual({ reviewCount: 10, correctCount: 8, incorrectCount: 2, accuracy: 0.8 });
  });
});

describe('progress percentage', () => {
  it.each([[0, 196, 0], [1, 196, (1 / 196) * 100], [196, 196, 100]])('%i / %i', (part, total, expected) => {
    expect(calculateProgressPercentage(part, total)).toBeCloseTo(expected, 10);
  });
  it('has no value when the total is 0, and never exceeds 100', () => {
    expect(calculateProgressPercentage(0, 0)).toBeNull();
    expect(calculateProgressPercentage(5, 4)).toBe(100);
  });
});

describe('daily progress: reviews today, review quota and new cards are three different numbers', () => {
  it('12 reviews = 8 quota (stateBefore not NEW) + 4 new; never 12 / 20', () => {
    const logs = [
      ...Array.from({ length: 4 }, (_, i) => logAt(i, 1_000 + i, 'NEW', { rating: 'GOOD' })),
      ...Array.from({ length: 8 }, (_, i) => logAt(10 + i, 2_000 + i, i % 2 === 0 ? 'LEARNING' : 'REVIEW', { rating: i === 0 ? 'AGAIN' : 'GOOD' })),
    ];
    const p = calculateDailyProgress(logs, { newCards: 10, reviews: 20 });
    expect(p).toMatchObject({ reviewsToday: 12, reviewQuotaUsed: 8, reviewQuotaLimit: 20, newCardsStudied: 4, newCardLimit: 10, remainingNewQuota: 6, correct: 11, incorrect: 1 });
    expect(p.accuracy).toBeCloseTo(11 / 12, 10);
  });
  it('nothing today -> zeros and no accuracy', () => {
    expect(calculateDailyProgress([], { newCards: 10, reviews: 20 })).toMatchObject({ reviewsToday: 0, accuracy: null, remainingNewQuota: 10 });
  });
  it('new available = min(remaining quota, unreviewed cards), never negative', () => {
    expect(calculateNewAvailable(6, 100)).toBe(6);
    expect(calculateNewAvailable(10, 3)).toBe(3);
    expect(calculateNewAvailable(0, 50)).toBe(0);
    expect(calculateNewAvailable(5, -2)).toBe(0);
  });
});

describe('Learned Kanji: counted per itemId, not per card', () => {
  const card = (c: string, mode: 'A' | 'B' | 'C' | 'D', state: LearningState) => storedCard(c, mode, { state });
  it('one mode reviewed -> 1 learned (the other three NEW)', () => {
    const cards = [card('水', 'A', 'LEARNING'), card('水', 'B', 'NEW'), card('水', 'C', 'NEW'), card('水', 'D', 'NEW')];
    expect(calculateLearnedKanji(cards)).toBe(1);
  });
  it('several modes of the same kanji are still 1; two kanji are 2', () => {
    const cards = [card('水', 'A', 'REVIEW'), card('水', 'B', 'MASTERED'), card('水', 'C', 'RELEARNING'), card('火', 'A', 'LEARNING')];
    expect(calculateLearnedKanji(cards)).toBe(2);
  });
  it('only NEW cards, or no cards, -> 0', () => {
    expect(calculateLearnedKanji([card('水', 'A', 'NEW'), card('火', 'B', 'NEW')])).toBe(0);
    expect(calculateLearnedKanji([])).toBe(0);
  });
  it('the same card appearing twice is one kanji', () => {
    expect(calculateLearnedKanji([card('水', 'A', 'REVIEW'), card('水', 'A', 'REVIEW')])).toBe(1);
  });
});

describe('Mastered Kanji: all four modes exist and are MASTERED', () => {
  const four = (c: string, states: [LearningState, LearningState, LearningState, LearningState]) =>
    (['A', 'B', 'C', 'D'] as const).map((m, i) => storedCard(c, m, { state: states[i]! }));
  it('all four MASTERED -> 1', () => expect(calculateMasteredKanji(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'MASTERED']))).toBe(1));
  it('three MASTERED and one NEW/REVIEW -> 0', () => {
    expect(calculateMasteredKanji(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'NEW']))).toBe(0);
    expect(calculateMasteredKanji(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'REVIEW']))).toBe(0);
  });
  it('a missing mode is not mastered (and nothing is created for it)', () => {
    const cards = [storedCard('水', 'A', { state: 'MASTERED' }), storedCard('水', 'B', { state: 'MASTERED' }), storedCard('水', 'C', { state: 'MASTERED' })];
    expect(calculateMasteredKanji(cards)).toBe(0);
    expect(cards).toHaveLength(3);
  });
  it('counts each mastered kanji once, mixed with others', () => {
    const cards = [...four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'MASTERED']), ...four('火', ['MASTERED', 'REVIEW', 'MASTERED', 'MASTERED']), ...four('山', ['MASTERED', 'MASTERED', 'MASTERED', 'MASTERED'])];
    expect(calculateMasteredKanji(cards)).toBe(2);
  });
});

describe('Review Cards by state (cards, not kanji)', () => {
  it('counts every state, including zeros', () => {
    const cards = [storedCard('水', 'A', { state: 'REVIEW' }), storedCard('水', 'B', { state: 'NEW' }), storedCard('火', 'A', { state: 'REVIEW' })];
    expect(countCardsByState(cards, LEARNING_STATES)).toEqual({ NEW: 1, LEARNING: 0, REVIEW: 2, RELEARNING: 0, MASTERED: 0 });
  });
});

describe('streak: consecutive local days with at least one successful review', () => {
  const TODAY = '2026-10-05';
  it('no reviews -> 0 / 0 / not studied', () => expect(calculateStreak(set(), TODAY)).toEqual({ current: 0, longest: 0, studiedToday: false }));
  it('only today -> 1', () => expect(calculateStreak(set('2026-10-05'), TODAY)).toEqual({ current: 1, longest: 1, studiedToday: true }));
  it('2 consecutive days ending today -> 2', () => expect(calculateStreak(set('2026-10-04', '2026-10-05'), TODAY).current).toBe(2));
  it('Sep 28-30 + Oct 1: 4 consecutive days', () => {
    expect(calculateStreak(set('2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'), '2026-10-01').current).toBe(4);
  });
  it('a gap resets it: Oct 1,2,3 then nothing on Oct 4, then Oct 5 -> current 1, longest 3', () => {
    expect(calculateStreak(set('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'), TODAY)).toMatchObject({ current: 1, longest: 3 });
  });
  it('not studied today but yesterday -> the streak is still alive (ends yesterday)', () => {
    expect(calculateStreak(set('2026-10-03', '2026-10-04'), TODAY)).toEqual({ current: 2, longest: 2, studiedToday: false });
  });
  it('last study two days ago -> current 0', () => expect(calculateStreak(set('2026-10-03'), TODAY).current).toBe(0));
  it('multiple gaps', () => {
    expect(calculateStreak(set('2026-09-01', '2026-09-03', '2026-09-04', '2026-09-10', '2026-10-05'), TODAY)).toMatchObject({ current: 1, longest: 2 });
  });
  it('crosses month and year boundaries and leap day', () => {
    expect(calculateStreak(set('2026-12-31', '2027-01-01', '2027-01-02'), '2027-01-02').current).toBe(3);
    expect(calculateStreak(set('2028-02-28', '2028-02-29', '2028-03-01'), '2028-03-01').current).toBe(3);
  });
});

describe('longest streak', () => {
  it.each([
    [[], 0],
    [['2026-10-01'], 1],
    [['2026-10-01', '2026-10-02', '2026-10-03'], 3],
    [['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'], 5],
    [['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-09-01', '2026-09-02'], 5],
  ])('%j -> %i', (days, expected) => expect(calculateLongestStreak(new Set(days))).toBe(expected));
  it('is never replaced by the current streak when an older one was longer', () => {
    expect(calculateStreak(set('2026-09-01', '2026-09-02', '2026-09-03', '2026-10-05'), '2026-10-05')).toMatchObject({ current: 1, longest: 3 });
  });
});

describe('calendar-day arithmetic is independent of the time zone', () => {
  it('consecutive dates differ by exactly one day, across DST and year ends', () => {
    expect(dayNumber('2026-03-09') - dayNumber('2026-03-08')).toBe(1);
    expect(dayNumber('2026-11-02') - dayNumber('2026-11-01')).toBe(1);
    expect(keyFromDayNumber(dayNumber('2026-12-31') + 1)).toBe('2027-01-01');
  });
});

describe.each(['Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC'] as const)('day grouping in %s uses the local calendar day, never UTC', (zone) => {
  const use = () => {
    process.env.TZ = zone;
  };
  it('23:59:59.999 belongs to the day, 00:00:00.000 to the next', () => {
    use();
    const end = new Date(2026, 9, 2, 23, 59, 59, 999).getTime();
    const start = new Date(2026, 9, 3, 0, 0, 0, 0).getTime();
    expect(localDateKey(end)).toBe('2026-10-02');
    expect(localDateKey(start)).toBe('2026-10-03');
    expect(localDateKey(start - 1)).toBe('2026-10-02');
  });
  it('00:30 local is that local date even when the UTC date is different', () => {
    use();
    expect(localDateKey(new Date(2026, 9, 3, 0, 30).getTime())).toBe('2026-10-03');
  });
  it('a review at 23:59 and one at 00:00 are two different study days (streak 2)', () => {
    use();
    const logs = [logAt(1, new Date(2026, 9, 2, 23, 59).getTime(), 'REVIEW'), logAt(2, new Date(2026, 9, 3, 0, 0).getTime(), 'REVIEW')];
    const days = new Set(keyLogs(logs).map((k) => k.dateKey));
    expect(calculateStreak(days, '2026-10-03')).toMatchObject({ current: 2, longest: 2 });
  });
});

describe('review history by day', () => {
  const TODAY_MS = new Date(2026, 9, 10, 15).getTime();
  const day = (d: number, hour = 10) => new Date(2026, 9, d, hour).getTime();
  const logs = [
    logAt(1, day(10), 'REVIEW', { rating: 'GOOD' }),
    logAt(2, day(10, 11), 'REVIEW', { rating: 'AGAIN' }),
    logAt(3, day(8), 'NEW', { rating: 'EASY' }),
    logAt(4, day(1), 'REVIEW', { rating: 'HARD' }),
    logAt(5, day(10, 23), 'LEARNING', { rating: 'GOOD' }),
  ];
  const keyed = keyLogs(logs);
  it('7 days: one entry per day, oldest first, zero days included, correct counts', () => {
    const h = aggregateReviewsByDay(keyed, '2026-10-10', 7);
    expect(h.map((d) => d.date)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
    expect(h[6]).toEqual({ date: '2026-10-10', reviewCount: 3, correctCount: 2, incorrectCount: 1, accuracy: 2 / 3 });
    expect(h[4]).toMatchObject({ reviewCount: 1, correctCount: 1, accuracy: 1 });
    expect(h[0]).toEqual({ date: '2026-10-04', reviewCount: 0, correctCount: 0, incorrectCount: 0, accuracy: null });
  });
  it('30 days includes older reviews, 7 days does not', () => {
    expect(aggregateReviewsByDay(keyed, '2026-10-10', 30).reduce((n, d) => n + d.reviewCount, 0)).toBe(5);
    expect(aggregateReviewsByDay(keyed, '2026-10-10', 7).reduce((n, d) => n + d.reviewCount, 0)).toBe(4);
    expect(logsInLastDays(keyed, '2026-10-10', 7)).toHaveLength(4);
    expect(logsInLastDays(keyed, '2026-10-10', 1)).toHaveLength(3);
  });
  it('no reviews -> a full series of empty days (nothing invented)', () => {
    const h = aggregateReviewsByDay([], '2026-10-10', 7);
    expect(h).toHaveLength(7);
    expect(h.every((d) => d.reviewCount === 0 && d.accuracy === null)).toBe(true);
  });
  it('is unchanged by the order of the logs', () => {
    expect(aggregateReviewsByDay(keyLogs([...logs].reverse()), '2026-10-10', 30)).toEqual(aggregateReviewsByDay(keyed, '2026-10-10', 30));
    expect(TODAY_MS).toBeGreaterThan(0);
  });
});
