import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepositories, type Repositories } from '../../../src/repositories/indexeddb';
import { MINUTES_PER_DAY, MS_PER_MINUTE, createNewCard, updateCardState } from '../../../src/services/srs';
import { openTestDatabase } from '../../helpers/testDatabase';

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openTestDatabase();
  dispose = opened.dispose;
  repos = createIndexedDbRepositories(opened.db);
});
afterEach(() => dispose());

const NOW = 1_800_000_000_000;
const item = (n: number) => ({ itemType: 'kanji', itemId: `kanji:U+${n}` }) as const;

describe('srs-v1 cards through the real ReviewRepository', () => {
  it('stores and reads back every scheduling field, including algorithmVersion', async () => {
    const reviewed = updateCardState(createNewCard(item(1), 'A', NOW), 'GOOD', NOW).card;
    await repos.review.saveCard(reviewed);
    expect(await repos.review.getCard(reviewed.id)).toEqual(reviewed);
    expect((await repos.review.getCard(reviewed.id))?.algorithmVersion).toBe('srs-v1');
  });

  it('NEW cards are returned by getNewCards (creation order) and never by getDueCards', async () => {
    await repos.review.saveCard(createNewCard(item(2), 'A', NOW + 20));
    await repos.review.saveCard(createNewCard(item(1), 'A', NOW + 10));
    expect((await repos.review.getNewCards(10)).map((c) => c.itemId)).toEqual(['kanji:U+1', 'kanji:U+2']);
    expect(await repos.review.getDueCards(new Date(NOW + 1_000_000), 10)).toEqual([]);
  });

  it('a reviewed card becomes due exactly at its due time: 1 ms before no, at due yes, after yes', async () => {
    const reviewed = updateCardState(createNewCard(item(1), 'A', NOW), 'AGAIN', NOW).card; // due in 10 min
    await repos.review.saveCard(reviewed);
    const due = NOW + 10 * MS_PER_MINUTE;
    expect(reviewed.due).toBe(due);
    expect(await repos.review.getDueCards(new Date(due - 1), 10)).toEqual([]);
    expect((await repos.review.getDueCards(new Date(due), 10)).map((c) => c.id)).toEqual([reviewed.id]);
    expect((await repos.review.getDueCards(new Date(due + 1), 10)).map((c) => c.id)).toEqual([reviewed.id]);
  });

  it('due cards come back overdue-first, ties broken by id, whatever their state', async () => {
    const make = (n: number, rating: 'AGAIN' | 'GOOD', at: number) =>
      updateCardState(createNewCard(item(n), 'A', at), rating, at).card;
    const a = make(3, 'AGAIN', NOW); // LEARNING, due NOW + 10 min
    const b = make(1, 'AGAIN', NOW); // same due as a
    const c = make(2, 'AGAIN', NOW - 3 * MINUTES_PER_DAY * MS_PER_MINUTE); // long overdue
    for (const card of [a, b, c]) await repos.review.saveCard(card);
    const ids = (await repos.review.getDueCards(new Date(NOW + 11 * MS_PER_MINUTE), 10)).map((x) => x.itemId);
    expect(ids).toEqual(['kanji:U+2', 'kanji:U+1', 'kanji:U+3']);
    expect((await repos.review.getDueCards(new Date(NOW + 11 * MS_PER_MINUTE), 2)).map((x) => x.itemId)).toEqual(['kanji:U+2', 'kanji:U+1']);
  });
});
