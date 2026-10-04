import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAppServices } from '../../../src/app/bootstrap';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { computeStatistics } from '../../../src/services/statistics/statisticsService';
import { RepositoryError } from '../../../src/utils/errors';
import { openRealRepositories } from '../../helpers/realData';
import { NOON } from '../../helpers/sessionFixtures';

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

const stats = () => computeStatistics({ review: repos.review, kanji: repos.kanji, now: () => NOON });
const request = { item: { itemType: 'kanji' as const, itemId: 'kanji:U+6C34' }, mode: 'A' as const, rating: 'GOOD' as const, answeredAt: NOON - 1_000, durationMs: 900 };

describe('a review whose save failed is not a review in the statistics', () => {
  it('failed save: nothing counted anywhere; the retry is counted once', async () => {
    const services = buildAppServices(repos);
    vi.spyOn(repos.review, 'recordReview').mockRejectedValueOnce(new RepositoryError('disk full'));
    await expect(services.reviewOrchestrator!.submit(request)).rejects.toBeInstanceOf(RepositoryError);

    const afterFailure = await stats();
    expect(afterFailure.today).toMatchObject({ reviewsToday: 0, correct: 0, incorrect: 0, accuracy: null, newCardsStudied: 0, studied: false });
    expect(afterFailure.kanji.learned).toBe(0);
    expect(afterFailure.streak.current).toBe(0);
    expect(afterFailure.periods.allTime.reviewCount).toBe(0);

    await services.reviewOrchestrator!.submit(request);
    const afterRetry = await stats();
    expect(afterRetry.today).toMatchObject({ reviewsToday: 1, correct: 1, accuracy: 1, newCardsStudied: 1, studied: true });
    expect(afterRetry.kanji.learned).toBe(1);
    expect(afterRetry.periods.allTime.reviewCount).toBe(1);
  });
});
