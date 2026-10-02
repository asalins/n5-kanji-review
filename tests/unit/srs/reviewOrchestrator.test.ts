import { describe, expect, it } from 'vitest';
import { createReviewOrchestrator, type ReviewRecorder } from '../../../src/features/review/reviewOrchestrator';
import type { ReviewRequest } from '../../../src/features/review/reviewBoundary';
import { MS_PER_MINUTE, createNewCard } from '../../../src/services/srs';
import type { ReviewCard, ReviewLog } from '../../../src/types/entities';
import { RepositoryError, ValidationError } from '../../../src/utils/errors';

/** In-memory recorder that is atomic by construction: it writes both or neither. */
function fakeRecorder(failWith?: Error) {
  const cards = new Map<string, ReviewCard>();
  const logs: ReviewLog[] = [];
  const recorder: ReviewRecorder = {
    getCard: (id) => Promise.resolve(cards.get(id) ?? null),
    recordReview: (card, log) => {
      if (failWith !== undefined) return Promise.reject(failWith);
      cards.set(card.id, card);
      logs.push(log);
      return Promise.resolve();
    },
  };
  return { recorder, cards, logs };
}

const NOW = 1_800_000_000_000;
const request = (over: Partial<ReviewRequest> = {}): ReviewRequest => ({
  item: { itemType: 'kanji', itemId: 'kanji:U+6C34' },
  mode: 'A',
  rating: 'GOOD',
  answeredAt: NOW,
  durationMs: 1_234,
  ...over,
});
const make = (recorder: ReviewRecorder, version: string | null = 'n5-2026.10.01') =>
  createReviewOrchestrator({ recorder, getDatasetVersion: () => Promise.resolve(version) });

describe('review orchestrator (rating intent -> SRS -> card + log)', () => {
  it('starts a NEW card on the first review and stores card and log together', async () => {
    const { recorder, cards, logs } = fakeRecorder();
    await make(recorder).submit(request());
    const card = cards.get('kanji:kanji:U+6C34:A');
    expect(card).toMatchObject({ state: 'LEARNING', interval: 1_440, reviewCount: 1, correctCount: 1, lastReviewed: NOW, algorithmVersion: 'srs-v1' });
    expect(card?.due).toBe(NOW + 1_440 * MS_PER_MINUTE);
    expect(logs).toHaveLength(1);
  });

  it('logs the real before/after states, rating, time, duration and dataset version', async () => {
    const { recorder, logs } = fakeRecorder();
    await make(recorder, 'n5-2026.10.01').submit(request({ rating: 'EASY', durationMs: 900 }));
    expect(logs[0]).toEqual({
      id: 'kanji:kanji:U+6C34:A#1',
      cardId: 'kanji:kanji:U+6C34:A',
      rating: 'EASY',
      reviewedAt: NOW,
      durationMs: 900,
      stateBefore: 'NEW',
      stateAfter: 'REVIEW',
      datasetVersion: 'n5-2026.10.01',
    });
    expect(logs[0]!.stateBefore).not.toBe(logs[0]!.stateAfter);
  });

  it('keeps every log (ids are unique per review) and builds on the stored card', async () => {
    const { recorder, cards, logs } = fakeRecorder();
    const orchestrator = make(recorder);
    await orchestrator.submit(request({ rating: 'AGAIN', answeredAt: NOW }));
    await orchestrator.submit(request({ rating: 'GOOD', answeredAt: NOW + 10 * MS_PER_MINUTE }));
    expect(logs.map((l) => l.id)).toEqual(['kanji:kanji:U+6C34:A#1', 'kanji:kanji:U+6C34:A#2']);
    expect(logs[1]).toMatchObject({ stateBefore: 'LEARNING', stateAfter: 'LEARNING' });
    expect(cards.get('kanji:kanji:U+6C34:A')).toMatchObject({ reviewCount: 2, correctCount: 1, incorrectCount: 1 });
  });

  it('modes are separate cards', async () => {
    const { recorder, cards } = fakeRecorder();
    await make(recorder).submit(request({ mode: 'A' }));
    await make(recorder).submit(request({ mode: 'C' }));
    expect([...cards.keys()].sort()).toEqual(['kanji:kanji:U+6C34:A', 'kanji:kanji:U+6C34:C']);
  });

  it('records a null dataset version when none is loaded (never invents one)', async () => {
    const { recorder, logs } = fakeRecorder();
    await make(recorder, null).submit(request());
    expect(logs[0]!.datasetVersion).toBeNull();
  });

  it('rejects, and stores nothing, when the write fails (the UI must not report success)', async () => {
    const { recorder, cards, logs } = fakeRecorder(new RepositoryError('write failed'));
    await expect(make(recorder).submit(request())).rejects.toBeInstanceOf(RepositoryError);
    expect(cards.size).toBe(0);
    expect(logs).toHaveLength(0);
  });

  it('refuses a card scheduled by another algorithm version instead of reinterpreting it', async () => {
    const { recorder, cards, logs } = fakeRecorder();
    cards.set('kanji:kanji:U+6C34:A', { ...createNewCard({ itemType: 'kanji', itemId: 'kanji:U+6C34' }, 'A', NOW), algorithmVersion: 'srs-v2' });
    await expect(make(recorder).submit(request())).rejects.toBeInstanceOf(ValidationError);
    expect(logs).toHaveLength(0);
  });
});
