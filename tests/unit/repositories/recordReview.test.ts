import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAppServices } from '../../../src/app/bootstrap';
import { createIndexedDbRepositories, type Repositories } from '../../../src/repositories/indexeddb';
import { RepositoryError, ValidationError } from '../../../src/utils/errors';
import { makeCard, makeLog } from '../../helpers/fixtures';
import { openRealRepositories } from '../../helpers/realData';
import { openTestDatabase } from '../../helpers/testDatabase';

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openTestDatabase();
  dispose = opened.dispose;
  repos = createIndexedDbRepositories(opened.db);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await dispose();
});

const ALL = { from: new Date(0), to: new Date(8.64e15) };
const original = () => makeCard({ reviewCount: 1, correctCount: 1 });
const updated = () => makeCard({ reviewCount: 2, correctCount: 2, interval: 4_320 });
const logFor = (n: number) => makeLog({ id: `${makeCard().id}#${n}`, cardId: makeCard().id });

describe('ReviewRepository.recordReview: atomic card + log', () => {
  it('stores the card and the log together', async () => {
    await repos.review.recordReview(updated(), logFor(2));
    expect(await repos.review.getCard(makeCard().id)).toEqual(updated());
    expect(await repos.review.getLogs(ALL)).toEqual([logFor(2)]);
  });

  it('an invalid card writes nothing (no card update, no log)', async () => {
    await repos.review.saveCard(original());
    await expect(repos.review.recordReview({ ...updated(), state: 'BOGUS' } as never, logFor(2))).rejects.toBeInstanceOf(ValidationError);
    expect(await repos.review.getCard(makeCard().id)).toEqual(original());
    expect(await repos.review.getLogs(ALL)).toEqual([]);
  });

  it('an invalid log writes nothing (no card update, no log)', async () => {
    await repos.review.saveCard(original());
    await expect(repos.review.recordReview(updated(), { ...logFor(2), durationMs: -5 })).rejects.toBeInstanceOf(ValidationError);
    expect(await repos.review.getCard(makeCard().id)).toEqual(original());
    expect(await repos.review.getLogs(ALL)).toEqual([]);
  });

  it('a log for a different card is rejected before any write', async () => {
    await expect(repos.review.recordReview(updated(), { ...logFor(2), cardId: 'kanji:other:A' })).rejects.toBeInstanceOf(ValidationError);
    expect(await repos.review.getCard(makeCard().id)).toBeNull();
  });

  it('a duplicate log id rolls back the WHOLE transaction: the card keeps its old value, no new log', async () => {
    await repos.review.saveCard(original());
    await repos.review.appendLog(logFor(2)); // id already taken
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await expect(repos.review.recordReview(updated(), logFor(2))).rejects.toBeInstanceOf(RepositoryError);
    // the card write really happened inside the transaction before the log failed ...
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ reviewCount: 2 }));
    // ... and was rolled back
    expect(await repos.review.getCard(makeCard().id)).toEqual(original());
    expect(await repos.review.getLogs(ALL)).toEqual([logFor(2)]); // the old log is untouched, nothing new
  });

  it('an injected failure on the log write (after the card write) rolls the card back', async () => {
    await repos.review.saveCard(original());
    const realAdd = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof realAdd>) {
      if (this.name === 'reviewLogs') throw new Error('injected log write failure');
      return realAdd.apply(this, args);
    });
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await expect(repos.review.recordReview(updated(), logFor(2))).rejects.toBeInstanceOf(RepositoryError);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ reviewCount: 2 }));
    vi.restoreAllMocks();
    expect(await repos.review.getCard(makeCard().id)).toEqual(original());
    expect(await repos.review.getLogs(ALL)).toEqual([]);
  });

  it('a failure on a brand-new card leaves no card and no log behind', async () => {
    await repos.review.appendLog(logFor(1));
    await expect(repos.review.recordReview(makeCard({ reviewCount: 1 }), logFor(1))).rejects.toBeInstanceOf(RepositoryError);
    expect(await repos.review.getCard(makeCard().id)).toBeNull();
  });

  it('uses one transaction over both stores and not the separate saveCard/appendLog calls', () => {
    const source = readFileSync('src/repositories/indexeddb/IndexedDbReviewRepository.ts', 'utf8');
    const body = source.slice(source.indexOf('recordReview('), source.indexOf('getLogs('));
    expect(body).toMatch(/transaction\(\[STORES\.reviewCards, STORES\.reviewLogs\], 'readwrite'\)/);
    expect(body).toMatch(/reviewLogs\)\.add\(/);
    expect(body).not.toMatch(/saveCard\(|appendLog\(|\.put\(validLog|\.db\.put\(|\.db\.add\(/);
  });
});

describe('production wiring: rating -> SRS -> atomic write (real repositories, real dataset)', () => {
  it('stores the card and a log carrying the loaded dataset version', async () => {
    const real = await openRealRepositories();
    try {
      const services = buildAppServices(real.repos);
      const NOW = 1_800_000_000_000;
      await services.reviewOrchestrator!.submit({
        item: { itemType: 'kanji', itemId: 'kanji:U+6C34' },
        mode: 'A',
        rating: 'GOOD',
        answeredAt: NOW,
        durationMs: 2_500,
      });
      const card = await real.repos.review.getCard('kanji:kanji:U+6C34:A');
      expect(card).toMatchObject({ state: 'LEARNING', reviewCount: 1, correctCount: 1, algorithmVersion: 'srs-v1' });
      const logs = await real.repos.review.getLogs({ from: new Date(0), to: new Date(NOW + 1) });
      expect(logs).toEqual([
        expect.objectContaining({ cardId: card!.id, rating: 'GOOD', durationMs: 2_500, stateBefore: 'NEW', stateAfter: 'LEARNING', datasetVersion: 'n5-2026.10.01' }),
      ]);
    } finally {
      await real.dispose();
    }
  });

  it('a failing write rejects the review and leaves no card behind', async () => {
    const real = await openRealRepositories();
    try {
      await real.repos.review.appendLog(makeLog({ id: 'kanji:kanji:U+6C34:A#1', cardId: 'kanji:kanji:U+6C34:A' })); // collides with the first log id
      const services = buildAppServices(real.repos);
      await expect(
        services.reviewOrchestrator!.submit({ item: { itemType: 'kanji', itemId: 'kanji:U+6C34' }, mode: 'A', rating: 'GOOD', answeredAt: 1_800_000_000_000, durationMs: 1 }),
      ).rejects.toBeInstanceOf(RepositoryError);
      expect(await real.repos.review.getCard('kanji:kanji:U+6C34:A')).toBeNull();
    } finally {
      await real.dispose();
    }
  });
});
