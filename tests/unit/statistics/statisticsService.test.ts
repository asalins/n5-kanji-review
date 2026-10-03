import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { DatasetUnavailableError } from '../../../src/services/session/sessionEngine';
import { computeStatistics } from '../../../src/services/statistics/statisticsService';
import { RepositoryError, ValidationError } from '../../../src/utils/errors';
import { openRealRepositories } from '../../helpers/realData';
import { NOON, logAt, storedCard } from '../../helpers/sessionFixtures';

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await dispose();
});

const deps = (now = NOON) => ({ review: repos.review, kanji: repos.kanji, now: () => now });
const DAY = 86_400_000;
const MODES = ['A', 'B', 'C', 'D'] as const;

describe('statistics from real repositories (real dataset, no mock numbers)', () => {
  it('zero data: zeros, no accuracy, no history, total from the dataset (196)', async () => {
    const s = await computeStatistics(deps());
    expect(s.hasReviews).toBe(false);
    expect(s.today).toMatchObject({ reviewsToday: 0, correct: 0, incorrect: 0, accuracy: null, reviewQuotaUsed: 0, newCardsStudied: 0, studied: false });
    expect(s.kanji).toMatchObject({ total: 196, learned: 0, mastered: 0, remaining: 196, learnedPercent: 0, masteredPercent: 0 });
    expect(s.streak).toEqual({ current: 0, longest: 0, studiedToday: false });
    expect(s.queue).toEqual({ due: 0, newAvailable: 10 });
    expect(s.periods.allTime).toMatchObject({ reviewCount: 0, accuracy: null });
    expect(s.reviewCards).toBe(0);
  });

  it('counts reviews, quota and new cards from the stored logs of the local day only', async () => {
    const yesterday = NOON - DAY;
    await repos.review.appendLog(logAt(1, NOON - 1000, 'NEW', { rating: 'GOOD' }));
    await repos.review.appendLog(logAt(2, NOON - 2000, 'NEW', { rating: 'AGAIN' }));
    await repos.review.appendLog(logAt(3, NOON - 3000, 'LEARNING', { rating: 'EASY' }));
    await repos.review.appendLog(logAt(4, NOON - 4000, 'REVIEW', { rating: 'HARD' }));
    await repos.review.appendLog(logAt(5, yesterday, 'REVIEW', { rating: 'GOOD' }));
    const s = await computeStatistics(deps());
    expect(s.hasReviews).toBe(true);
    expect(s.today).toMatchObject({ reviewsToday: 4, correct: 3, incorrect: 1, reviewQuotaUsed: 2, reviewQuotaLimit: 20, newCardsStudied: 2, newCardLimit: 10, studied: true });
    expect(s.today.accuracy).toBe(0.75);
    expect(s.periods.allTime.reviewCount).toBe(5);
    expect(s.streak).toEqual({ current: 2, longest: 2, studiedToday: true });
    expect(s.queue.newAvailable).toBe(8); // 10 - 2 introduced today
  });

  it('learned and mastered are per kanji; due counts every due card; unreviewed NEW cards are not learned', async () => {
    for (const mode of MODES) await repos.review.saveCard(storedCard('水', mode, { state: 'MASTERED', reviewCount: 9, due: NOON + DAY }));
    await repos.review.saveCard(storedCard('火', 'A', { state: 'REVIEW', reviewCount: 2, due: NOON - 1 }));
    await repos.review.saveCard(storedCard('火', 'B', { state: 'NEW' }));
    await repos.review.saveCard(storedCard('山', 'A', { state: 'LEARNING', reviewCount: 1, due: NOON - 5 }));
    await repos.review.saveCard(storedCard('木', 'A', { state: 'REVIEW', reviewCount: 2, due: NOON + 1 }));
    const s = await computeStatistics(deps());
    expect(s.kanji).toMatchObject({ total: 196, learned: 4, mastered: 1, remaining: 192 });
    expect(s.cardsByState).toEqual({ NEW: 1, LEARNING: 1, REVIEW: 2, RELEARNING: 0, MASTERED: 4 });
    expect(s.reviewCards).toBe(8);
    expect(s.queue.due).toBe(2); // 火A and 山A; due exactly at NOON+1 is not due yet
    expect(s.kanji.learnedPercent).toBeCloseTo((4 / 196) * 100, 10);
  });

  it('due follows the repository and session definition: every non-NEW card whose due time has come, MASTERED included', async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'MASTERED', reviewCount: 9, due: NOON - 10 }));
    await repos.review.saveCard(storedCard('火', 'A', { state: 'NEW', due: NOON - 10 }));
    expect((await computeStatistics(deps())).queue.due).toBe(1);
  });

  it('new available = min(remaining quota, cards not yet reviewed)', async () => {
    // 195 kanji x 4 modes reviewed, 4 cards of one kanji unreviewed -> only 4 available although 10 are allowed
    const all = await repos.kanji.getByLevel('N5');
    for (const kanji of all.slice(1)) {
      for (const mode of MODES) {
        await repos.review.saveCard({ ...storedCard('水', mode), id: `kanji:${kanji.id}:${mode}`, itemId: kanji.id, state: 'REVIEW', reviewCount: 1, due: NOON + DAY });
      }
    }
    expect((await computeStatistics(deps())).queue.newAvailable).toBe(4);
  });

  it('history: 7 and 30 days from real logs, zero days included', async () => {
    await repos.review.appendLog(logAt(1, NOON, 'REVIEW', { rating: 'GOOD' }));
    await repos.review.appendLog(logAt(2, NOON - 10 * DAY, 'REVIEW', { rating: 'AGAIN' }));
    const s = await computeStatistics(deps());
    expect(s.history.last7).toHaveLength(7);
    expect(s.history.last30).toHaveLength(30);
    expect(s.periods.last7.reviewCount).toBe(1);
    expect(s.periods.last30.reviewCount).toBe(2);
    expect(s.history.last30.filter((d) => d.reviewCount > 0)).toHaveLength(2);
  });

  it('uses every successfully stored log, whatever its datasetVersion (approved policy)', async () => {
    await repos.review.appendLog(logAt(1, NOON - 1, 'REVIEW', { datasetVersion: 'n5-2026.10.01' }));
    await repos.review.appendLog(logAt(2, NOON - 2, 'REVIEW', { datasetVersion: 'n5-2099.01.01' }));
    await repos.review.appendLog(logAt(3, NOON - 3, 'REVIEW', { datasetVersion: null }));
    expect((await computeStatistics(deps())).today.reviewsToday).toBe(3);
  });

  it('creates and changes nothing, and does not use the legacy StreakState', async () => {
    const getStreak = vi.spyOn(repos.review, 'getStreakState');
    const saveStreak = vi.spyOn(repos.review, 'saveStreakState');
    const saveCard = vi.spyOn(repos.review, 'saveCard');
    const append = vi.spyOn(repos.review, 'appendLog');
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW', reviewCount: 1 }));
    saveCard.mockClear();
    await computeStatistics(deps());
    expect(saveCard).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(getStreak).not.toHaveBeenCalled();
    expect(saveStreak).not.toHaveBeenCalled();
    expect(await repos.review.getCard(storedCard('水', 'B').id)).toBeNull(); // no missing card was created
  });

  it('reads with a fixed number of queries (no per-kanji or per-card lookups)', async () => {
    for (const mode of MODES) await repos.review.saveCard(storedCard('水', mode, { state: 'REVIEW', reviewCount: 1 }));
    const getCard = vi.spyOn(repos.review, 'getCard');
    const getById = vi.spyOn(repos.kanji, 'getById');
    const getLogs = vi.spyOn(repos.review, 'getLogs');
    const byStates = vi.spyOn(repos.review, 'getCardsByStates');
    const byLevel = vi.spyOn(repos.kanji, 'getByLevel');
    await computeStatistics(deps());
    expect(getCard).not.toHaveBeenCalled();
    expect(getById).not.toHaveBeenCalled();
    expect([getLogs.mock.calls.length, byStates.mock.calls.length, byLevel.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it('is deterministic for the same data and clock', async () => {
    await repos.review.appendLog(logAt(1, NOON, 'NEW'));
    expect(await computeStatistics(deps())).toEqual(await computeStatistics(deps()));
  });

  it('a dataset that is not loaded is an error, never "0 of 0"', async () => {
    const empty = { ...deps(), kanji: { getByLevel: () => Promise.resolve([]) } };
    await expect(computeStatistics(empty)).rejects.toBeInstanceOf(DatasetUnavailableError);
  });

  it.each(['getLogs', 'getCardsByStates', 'getDueCards'] as const)('a failing %s rejects: no partial numbers are produced', async (method) => {
    vi.spyOn(repos.review, method).mockRejectedValue(new RepositoryError('boom'));
    await expect(computeStatistics(deps())).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe('ReviewRepository.getCardsByStates (uses the by-state index)', () => {
  beforeEach(async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW' }));
    await repos.review.saveCard(storedCard('水', 'B', { state: 'MASTERED' }));
    await repos.review.saveCard(storedCard('火', 'A', { state: 'NEW' }));
    await repos.review.saveCard(storedCard('山', 'A', { state: 'LEARNING' }));
  });
  it('returns only the requested states, sorted by id, without duplicates for repeated states', async () => {
    const cards = await repos.review.getCardsByStates(['REVIEW', 'LEARNING', 'REVIEW']);
    expect(cards.map((c) => c.state).sort()).toEqual(['LEARNING', 'REVIEW']);
    expect(cards.map((c) => c.id)).toEqual([...cards.map((c) => c.id)].sort());
  });
  it('an empty list of states returns nothing, and an unknown state is rejected', async () => {
    expect(await repos.review.getCardsByStates([])).toEqual([]);
    await expect(repos.review.getCardsByStates(['BOGUS' as never])).rejects.toBeInstanceOf(ValidationError);
  });
  it('all states returns every stored card', async () => {
    expect(await repos.review.getCardsByStates(['NEW', 'LEARNING', 'REVIEW', 'RELEARNING', 'MASTERED'])).toHaveLength(4);
  });
});
