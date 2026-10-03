import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { planSession } from '../../../src/services/session/sessionEngine';
import { computeStatistics } from '../../../src/services/statistics/statisticsService';
import { LEARNING_STATES, type LearningState } from '../../../src/types/entities';
import { isDueCard } from '../../../src/utils/dueCard';
import { openRealRepositories } from '../../helpers/realData';
import { NOON, realProjectList, storedCard } from '../../helpers/sessionFixtures';

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
});
afterEach(() => dispose());

const MINUTE = 60_000;
const BIG = 100_000;

describe('isDueCard: due = state is not NEW AND due <= now', () => {
  it.each([
    ['MASTERED', NOON - 1, true],
    ['MASTERED', NOON + 1, false],
    ['NEW', NOON - 1, false],
    ['LEARNING', NOON - 1, true],
    ['REVIEW', NOON - 1, true],
    ['RELEARNING', NOON - 1, true],
    ['LEARNING', NOON + 1, false],
    ['REVIEW', NOON + 1, false],
    ['RELEARNING', NOON + 1, false],
    ['NEW', NOON + 1, false],
  ] as const)('%s with due %i is due: %s', (state, due, expected) => {
    expect(isDueCard({ state, due }, NOON)).toBe(expected);
  });

  it('is due exactly at the due time, not one millisecond before', () => {
    expect(isDueCard({ state: 'REVIEW', due: NOON }, NOON)).toBe(true);
    expect(isDueCard({ state: 'REVIEW', due: NOON + 1 }, NOON)).toBe(false);
  });

  it('NEW is never due, whatever its due value (even 0)', () => {
    expect(isDueCard({ state: 'NEW', due: 0 }, NOON)).toBe(false);
  });
});

describe('one Due definition: dashboard = review session = repository', () => {
  /** Every state, on both sides of "now", for several kanji (real dataset characters). */
  async function seed(): Promise<void> {
    const chars = ['水', '火', '山', '木', '金', '土', '日', '月'];
    const states: LearningState[] = [...LEARNING_STATES, 'MASTERED', 'REVIEW', 'LEARNING'];
    let n = 0;
    for (const state of states) {
      for (const offset of [-5 * MINUTE, 0, 5 * MINUTE]) {
        const character = chars[n % chars.length]!;
        const mode = (['A', 'B', 'C', 'D'] as const)[Math.floor(n / chars.length) % 4]!;
        await repos.review.saveCard(storedCard(character, mode, { state, due: NOON + offset, reviewCount: state === 'NEW' ? 0 : 3 }));
        n += 1;
      }
    }
  }

  it('the same fixture gives the same Due count and the same cards in all three places', async () => {
    await seed();
    const all = await repos.review.getCardsByStates(LEARNING_STATES);
    const expected = all.filter((card) => isDueCard(card, NOON)).map((card) => card.id).sort();
    expect(expected.length).toBeGreaterThan(5);

    const stats = await computeStatistics({ review: repos.review, kanji: repos.kanji, now: () => NOON });
    const plan = await planSession({
      review: repos.review,
      kanji: repos.kanji,
      newItems: realProjectList,
      now: () => NOON,
      limits: { newCards: 0, reviews: BIG },
    });
    const sessionDue = plan.cards.filter((c) => c.kind === 'due').map((c) => c.card.id).sort();
    const repoDue = (await repos.review.getDueCards(new Date(NOON), BIG)).map((card) => card.id).sort();

    expect(stats.queue.due).toBe(expected.length);
    expect(sessionDue).toEqual(expected);
    expect(repoDue).toEqual(expected);
  });

  it('MASTERED counts as due when its time has come, and not before; NEW never does', async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'MASTERED', reviewCount: 9, due: NOON }));
    await repos.review.saveCard(storedCard('火', 'A', { state: 'MASTERED', reviewCount: 9, due: NOON + 1 }));
    await repos.review.saveCard(storedCard('山', 'A', { state: 'NEW', due: NOON - 1 }));
    const stats = await computeStatistics({ review: repos.review, kanji: repos.kanji, now: () => NOON });
    expect(stats.queue.due).toBe(1);
    const plan = await planSession({ review: repos.review, kanji: repos.kanji, newItems: realProjectList, now: () => NOON, limits: { newCards: 0, reviews: BIG } });
    expect(plan.cards.filter((c) => c.kind === 'due')).toHaveLength(1);
  });

  it.each(['LEARNING', 'REVIEW', 'RELEARNING'] as const)('%s with due <= now is counted by the dashboard and picked by the session', async (state) => {
    await repos.review.saveCard(storedCard('水', 'A', { state, reviewCount: 2, due: NOON - 1 }));
    const stats = await computeStatistics({ review: repos.review, kanji: repos.kanji, now: () => NOON });
    const plan = await planSession({ review: repos.review, kanji: repos.kanji, newItems: realProjectList, now: () => NOON, limits: { newCards: 0, reviews: BIG } });
    expect([stats.queue.due, plan.cards.length]).toEqual([1, 1]);
  });
});
