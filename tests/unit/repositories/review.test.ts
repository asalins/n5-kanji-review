import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepositories, type Repositories } from '../../../src/repositories/indexeddb';
import { RepositoryError, ValidationError } from '../../../src/utils/errors';
import type { AppDatabase } from '../../../src/services/storage/database';
import type { ReviewCard, UserSettings } from '../../../src/types/entities';
import { openTestDatabase } from '../../helpers/testDatabase';
import { makeCard, makeLog, session, settings, streak } from '../../helpers/fixtures';

let repos: Repositories;
let db: AppDatabase;
let dispose: () => Promise<void>;

beforeEach(async () => {
  ({ db, dispose } = await openTestDatabase());
  repos = createIndexedDbRepositories(db);
});
afterEach(() => dispose());

describe('ReviewRepository: cards', () => {
  it('saves and gets a card, and null when missing', async () => {
    const card = makeCard();
    await repos.review.saveCard(card);
    expect(await repos.review.getCard(card.id)).toEqual(card);
    expect(await repos.review.getCard('missing')).toBeNull();
  });

  it('saveCard overwrites the same id', async () => {
    await repos.review.saveCard(makeCard());
    await repos.review.saveCard(makeCard({ reviewCount: 5 }));
    expect((await repos.review.getCard(makeCard().id))?.reviewCount).toBe(5);
  });

  it('returns due cards (due <= now, not NEW) ordered by due, honouring the limit', async () => {
    await repos.review.saveCard(makeCard({ itemId: 'a', state: 'REVIEW', due: 300 }));
    await repos.review.saveCard(makeCard({ itemId: 'b', state: 'LEARNING', due: 100 }));
    await repos.review.saveCard(makeCard({ itemId: 'c', state: 'REVIEW', due: 999_999 }));
    await repos.review.saveCard(makeCard({ itemId: 'd', state: 'NEW', due: 50 }));
    const now = new Date(1_000);
    expect((await repos.review.getDueCards(now, 10)).map((c) => c.itemId)).toEqual(['b', 'a']);
    expect((await repos.review.getDueCards(now, 1)).map((c) => c.itemId)).toEqual(['b']);
    expect(await repos.review.getDueCards(now, 0)).toEqual([]);
  });

  it('treats a card due exactly now as due', async () => {
    await repos.review.saveCard(makeCard({ itemId: 'a', state: 'REVIEW', due: 1_000 }));
    expect(await repos.review.getDueCards(new Date(1_000), 5)).toHaveLength(1);
    expect(await repos.review.getDueCards(new Date(999), 5)).toHaveLength(0);
  });

  it('returns only NEW cards ordered by due then id, honouring the limit', async () => {
    await repos.review.saveCard(makeCard({ itemId: 'b', state: 'NEW', due: 20 }));
    await repos.review.saveCard(makeCard({ itemId: 'a', state: 'NEW', due: 20 }));
    await repos.review.saveCard(makeCard({ itemId: 'c', state: 'NEW', due: 10 }));
    await repos.review.saveCard(makeCard({ itemId: 'd', state: 'REVIEW', due: 1 }));
    expect((await repos.review.getNewCards(10)).map((c) => c.itemId)).toEqual(['c', 'a', 'b']);
    expect((await repos.review.getNewCards(2)).map((c) => c.itemId)).toEqual(['c', 'a']);
  });

  it('rejects invalid limits and invalid cards', async () => {
    await expect(repos.review.getDueCards(new Date(), -1)).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.review.getNewCards(1.5)).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.review.getDueCards(new Date('x'), 1)).rejects.toBeInstanceOf(ValidationError);
    const badState = { ...makeCard(), state: 'BOGUS' } as unknown as ReviewCard;
    await expect(repos.review.saveCard(badState)).rejects.toBeInstanceOf(ValidationError);
    const badId = { ...makeCard(), id: 'wrong' };
    await expect(repos.review.saveCard(badId)).rejects.toBeInstanceOf(ValidationError);
    const badNumber = { ...makeCard(), reviewCount: -1 };
    await expect(repos.review.saveCard(badNumber)).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps algorithmVersion on the stored card', async () => {
    await repos.review.saveCard(makeCard({ algorithmVersion: 'algo-7' }));
    expect((await repos.review.getCard(makeCard().id))?.algorithmVersion).toBe('algo-7');
  });

  it('reports a corrupted stored card as ValidationError', async () => {
    await db.put('reviewCards', { id: 'kanji:x:A' } as unknown as ReviewCard);
    await expect(repos.review.getCard('kanji:x:A')).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('ReviewRepository: logs', () => {
  it('appends logs and reads them by half-open date range', async () => {
    await repos.review.appendLog(makeLog({ id: 'l1', reviewedAt: 1_000 }));
    await repos.review.appendLog(makeLog({ id: 'l2', reviewedAt: 2_000 }));
    await repos.review.appendLog(makeLog({ id: 'l3', reviewedAt: 3_000 }));
    const ids = async (from: number, to: number) =>
      (await repos.review.getLogs({ from: new Date(from), to: new Date(to) })).map((l) => l.id);
    expect(await ids(1_000, 3_000)).toEqual(['l1', 'l2']); // from inclusive, to exclusive
    expect(await ids(0, 10_000)).toEqual(['l1', 'l2', 'l3']);
    expect(await ids(2_000, 2_000)).toEqual([]);
    expect(await ids(5_000, 6_000)).toEqual([]);
  });

  it('rejects a reversed range', async () => {
    await expect(repos.review.getLogs({ from: new Date(2), to: new Date(1) })).rejects.toBeInstanceOf(ValidationError);
  });

  it('is append-only: a duplicate log id fails as RepositoryError', async () => {
    await repos.review.appendLog(makeLog({ id: 'dup' }));
    await expect(repos.review.appendLog(makeLog({ id: 'dup' }))).rejects.toBeInstanceOf(RepositoryError);
  });

  it('rejects invalid logs', async () => {
    const bad = { ...makeLog(), rating: 'MEH' } as unknown as ReturnType<typeof makeLog>;
    await expect(repos.review.appendLog(bad)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('ReviewRepository: sessions and streak', () => {
  it('saves a study session (overwrite allowed while in progress)', async () => {
    await repos.review.saveSession(session);
    await repos.review.saveSession({
      ...session,
      endedAt: 2_000,
      summary: { reviewedCount: 1, correctCount: 1, incorrectCount: 0 },
    });
    const stored = await db.get('studySessions', session.id);
    expect(stored?.endedAt).toBe(2_000);
    expect(stored?.summary?.reviewedCount).toBe(1);
  });

  it('returns null streak until saved, then round-trips it', async () => {
    expect(await repos.review.getStreakState()).toBeNull();
    await repos.review.saveStreakState(streak);
    expect(await repos.review.getStreakState()).toEqual(streak);
  });

  it('rejects an invalid streak', async () => {
    await expect(repos.review.saveStreakState({ ...streak, currentStreak: -1 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('SettingsRepository', () => {
  it('returns null before first save, then round-trips', async () => {
    expect(await repos.settings.get()).toBeNull();
    await repos.settings.save(settings);
    expect(await repos.settings.get()).toEqual(settings);
  });

  it('keeps a single settings record (save overwrites)', async () => {
    await repos.settings.save(settings);
    await repos.settings.save({ ...settings, theme: 'dark' });
    expect((await repos.settings.get())?.theme).toBe('dark');
    expect(await db.count('userSettings')).toBe(1);
  });

  it('rejects invalid settings', async () => {
    const bad = { ...settings, theme: 'neon' } as unknown as UserSettings;
    await expect(repos.settings.save(bad)).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.settings.save({ ...settings, dailyNewCards: 2.5 })).rejects.toBeInstanceOf(ValidationError);
  });
});
