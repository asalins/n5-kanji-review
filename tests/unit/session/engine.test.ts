import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { DatasetUnavailableError, planSession, type SessionEngineDeps } from '../../../src/services/session/sessionEngine';
import type { NewItemSource } from '../../../src/services/session/types';
import { openRealRepositories } from '../../helpers/realData';
import { NOON, cardId, kanjiItem, logAt, realProjectList, storedCard } from '../../helpers/sessionFixtures';

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
});
afterEach(() => dispose());

const deps = (over: Partial<SessionEngineDeps> = {}, now = NOON): SessionEngineDeps => ({
  review: repos.review,
  kanji: repos.kanji,
  newItems: realProjectList,
  now: () => now,
  ...over,
});
const ids = (plan: Awaited<ReturnType<typeof planSession>>) => plan.cards.map((c) => c.card.id);
const MINUTE = 60_000;

describe('new cards come from the Project N5 list, in order, lazily', () => {
  it('first session: 10 new cards, 一二三 in list order, modes A-D per kanji', async () => {
    const plan = await planSession(deps());
    expect(plan.cards.every((c) => c.kind === 'new')).toBe(true);
    expect(ids(plan)).toEqual([
      cardId('一', 'A'), cardId('一', 'B'), cardId('一', 'C'), cardId('一', 'D'),
      cardId('二', 'A'), cardId('二', 'B'), cardId('二', 'C'), cardId('二', 'D'),
      cardId('三', 'A'), cardId('三', 'B'),
    ]);
    expect(plan.emptyReason).toBeNull();
  });

  it('creates only the cards the queue needs (not 196 x 4 = 784)', async () => {
    await planSession(deps({ limits: { newCards: 3, reviews: 20 } }));
    const stored = await repos.review.getNewCards(2_000);
    expect(stored.map((c) => c.id).sort()).toEqual([cardId('一', 'A'), cardId('一', 'B'), cardId('一', 'C')].sort());
    expect(await repos.review.getCard(cardId('二', 'A'))).toBeNull();
    // the full session creates exactly 10, still nowhere near 784
    await planSession(deps());
    expect(await repos.review.getNewCards(2_000)).toHaveLength(10);
  });

  it('each created card has the right identity and starts NEW with the srs-v1 version', async () => {
    await planSession(deps({ limits: { newCards: 1, reviews: 0 } }));
    expect(await repos.review.getCard(cardId('一', 'A'))).toMatchObject({
      id: 'kanji:kanji:U+4E00:A', itemType: 'kanji', itemId: 'kanji:U+4E00', mode: 'A', state: 'NEW', reviewCount: 0, algorithmVersion: 'srs-v1',
    });
  });

  it('planning again never duplicates or recreates cards', async () => {
    const first = await planSession(deps());
    const second = await planSession(deps({}, NOON + 5 * MINUTE));
    expect(ids(second)).toEqual(ids(first));
    expect(await repos.review.getNewCards(2_000)).toHaveLength(10);
    expect((await repos.review.getCard(cardId('一', 'A')))?.due).toBe(NOON); // created once, at the first plan
  });

  it('an existing card in state NEW is still a new card (not "missing") and is not recreated', async () => {
    await repos.review.saveCard(storedCard('一', 'A', { due: 5 }));
    const plan = await planSession(deps({ limits: { newCards: 2, reviews: 20 } }));
    expect(ids(plan)).toEqual([cardId('一', 'A'), cardId('一', 'B')]);
    expect(plan.cards[0]?.card.due).toBe(5);
  });

  it('introduced cards (any state but NEW) are skipped when picking new cards', async () => {
    await repos.review.saveCard(storedCard('一', 'A', { state: 'LEARNING', interval: 10, due: NOON + 10 * MINUTE, reviewCount: 1 }));
    const plan = await planSession(deps({ limits: { newCards: 2, reviews: 0 } }));
    expect(ids(plan)).toEqual([cardId('一', 'B'), cardId('一', 'C')]);
  });

  it('list entries that are not in the dataset are skipped, not guessed', async () => {
    const source: NewItemSource = {
      getOrderedItems: async () => [{ itemType: 'kanji', itemId: 'kanji:U+9999' }, kanjiItem('水')],
    };
    const plan = await planSession(deps({ newItems: source, limits: { newCards: 1, reviews: 0 } }));
    expect(ids(plan)).toEqual([cardId('水', 'A')]);
  });
});

describe('due cards have priority and a deterministic order', () => {
  const seedDue = async () => {
    // five due cards; two share the same due time to prove the id tie-break
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW', interval: 1_440, due: NOON - 5 * MINUTE, reviewCount: 1 }));
    await repos.review.saveCard(storedCard('火', 'A', { state: 'REVIEW', interval: 1_440, due: NOON - 9 * MINUTE, reviewCount: 1 }));
    await repos.review.saveCard(storedCard('山', 'A', { state: 'LEARNING', interval: 10, due: NOON - 9 * MINUTE, reviewCount: 1 }));
    await repos.review.saveCard(storedCard('木', 'A', { state: 'MASTERED', interval: 30_240, due: NOON - 1 * MINUTE, reviewCount: 9 }));
    await repos.review.saveCard(storedCard('川', 'A', { state: 'RELEARNING', interval: 10, due: NOON - 2 * MINUTE, reviewCount: 3 }));
  };

  it('limit 2 reviews + 2 new with 5 due and 196 new gives exactly 2 due then 2 new', async () => {
    await seedDue();
    const plan = await planSession(deps({ limits: { newCards: 2, reviews: 2 } }));
    expect(plan.cards.map((c) => c.kind)).toEqual(['due', 'due', 'new', 'new']);
    // earliest due first; equal due times are ordered by card id
    const tied = [cardId('火', 'A'), cardId('山', 'A')].sort();
    expect(plan.cards.slice(0, 2).map((c) => c.card.id)).toEqual(tied);
    expect(plan.cards.slice(2).map((c) => c.card.id)).toEqual([cardId('一', 'A'), cardId('一', 'B')]);
  });

  it('all due states are included (LEARNING, REVIEW, RELEARNING, MASTERED) and NEW cards are never "due"', async () => {
    await seedDue();
    await repos.review.saveCard(storedCard('日', 'A', { state: 'NEW', due: NOON - 100 * MINUTE }));
    const plan = await planSession(deps({ limits: { newCards: 0, reviews: 20 } }));
    expect(plan.cards).toHaveLength(5);
    expect(plan.cards.every((c) => c.kind === 'due' && c.card.state !== 'NEW')).toBe(true);
    // due ascending: 火 and 山 tie at -9 min (ordered by id), then 水 (-5), 川 (-2), 木 (-1)
    expect(ids(plan)).toEqual([...[cardId('火', 'A'), cardId('山', 'A')].sort(), cardId('水', 'A'), cardId('川', 'A'), cardId('木', 'A')]);
  });

  it('exact due instant: due at now is due, one millisecond later is not', async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW', interval: 1_440, due: NOON, reviewCount: 1 }));
    const atDue = await planSession(deps({ limits: { newCards: 0, reviews: 20 } }, NOON));
    const before = await planSession(deps({ limits: { newCards: 0, reviews: 20 } }, NOON - 1));
    expect(atDue.cards).toHaveLength(1);
    expect(before.cards).toHaveLength(0);
  });
});

describe('daily limits come from the stored logs of the local day', () => {
  const todayLogs = async (reviews: number, introduced: number) => {
    for (let i = 0; i < reviews; i += 1) await repos.review.appendLog(logAt(i, NOON - 1_000 - i, 'REVIEW'));
    for (let i = 0; i < introduced; i += 1) await repos.review.appendLog(logAt(500 + i, NOON - 1_000 - i, 'NEW'));
  };
  const dueCards = async (n: number) => {
    const chars = ['水', '火', '山', '木', '川', '日', '月', '金'];
    for (let i = 0; i < n; i += 1) await repos.review.saveCard(storedCard(chars[i] as string, 'A', { state: 'REVIEW', interval: 1_440, due: NOON - (100 - i) * MINUTE, reviewCount: 1 }));
  };

  it('1 review remaining -> exactly one due card', async () => {
    await dueCards(5);
    await todayLogs(19, 0);
    const plan = await planSession(deps({ limits: { newCards: 0, reviews: 20 } }));
    expect(plan.allowance.remainingReviews).toBe(1);
    expect(plan.cards).toHaveLength(1);
  });

  it.each([
    [20, 'exactly full'],
    [26, 'over the limit'],
  ])('review limit %i done (%s) -> no due cards, empty reason LIMITS_REACHED', async (done) => {
    await dueCards(3);
    await todayLogs(done, 0);
    const plan = await planSession(deps({ limits: { newCards: 0, reviews: 20 } }));
    expect(plan.allowance.remainingReviews).toBe(0);
    expect(plan.cards).toHaveLength(0);
    expect(plan.emptyReason).toBe('LIMITS_REACHED');
  });

  it('new limit with 1 remaining -> exactly one new card', async () => {
    await todayLogs(0, 9);
    const plan = await planSession(deps());
    expect(plan.allowance.remainingNew).toBe(1);
    expect(plan.cards).toHaveLength(1);
  });

  it.each([
    [10, 'exactly full'],
    [14, 'over the limit'],
  ])('new limit %i introduced (%s) -> no new cards, empty reason LIMITS_REACHED', async (introduced) => {
    await todayLogs(0, introduced);
    const plan = await planSession(deps());
    expect(plan.allowance.remainingNew).toBe(0);
    expect(plan.cards).toHaveLength(0);
    expect(plan.emptyReason).toBe('LIMITS_REACHED');
  });

  it('a failed review writes no log, so it consumes no slot', async () => {
    await todayLogs(0, 0);
    expect((await planSession(deps())).allowance).toMatchObject({ remainingNew: 10, remainingReviews: 20 });
  });

  it('only logs from the local calendar day count: 23:59:59.999 yesterday no, 00:00:00.000 today yes, 00:00 tomorrow no', async () => {
    const midnight = new Date(2026, 9, 2, 0, 0, 0, 0).getTime();
    await repos.review.appendLog(logAt(1, midnight - 1, 'NEW')); // yesterday 23:59:59.999
    await repos.review.appendLog(logAt(2, midnight, 'NEW')); // today 00:00:00.000
    await repos.review.appendLog(logAt(3, midnight + 24 * 3_600_000, 'NEW')); // tomorrow 00:00
    const plan = await planSession(deps());
    expect(plan.allowance.newIntroduced).toBe(1);
    expect(plan.localDate).toBe('2026-10-02');
  });
});

describe('empty sessions are told apart', () => {
  it('nothing due and no new card available -> NOTHING_AVAILABLE (not a limit, not an error)', async () => {
    const plan = await planSession(deps({ newItems: { getOrderedItems: async () => [] } }));
    expect(plan.cards).toHaveLength(0);
    expect(plan.emptyReason).toBe('NOTHING_AVAILABLE');
  });

  it('limits of zero while cards exist -> LIMITS_REACHED', async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW', interval: 1_440, due: NOON - MINUTE, reviewCount: 1 }));
    const plan = await planSession(deps({ limits: { newCards: 0, reviews: 0 } }));
    expect(plan.emptyReason).toBe('LIMITS_REACHED');
  });

  it('a repository failure is an error, never an empty result', async () => {
    const broken = { ...deps(), review: Object.assign(Object.create(repos.review), { getLogs: () => Promise.reject(new Error('db down')) }) };
    await expect(planSession(broken)).rejects.toThrow('db down');
  });
});

describe('missing dataset is an error, never an empty result', () => {
  it('a list that names kanji absent from the content stores throws DatasetUnavailableError', async () => {
    const empty = Object.assign(Object.create(repos.kanji) as Repositories['kanji'], { getById: () => Promise.resolve(null) });
    await expect(planSession(deps({ kanji: empty }))).rejects.toBeInstanceOf(DatasetUnavailableError);
  });
  it('an empty list is simply nothing available (no data problem)', async () => {
    const none: NewItemSource = { getOrderedItems: () => Promise.resolve([]) };
    expect((await planSession(deps({ newItems: none }))).emptyReason).toBe('NOTHING_AVAILABLE');
  });
});

describe('due ordering does not depend on the repository', () => {
  it('sorts by due then id even when the repository returns them in another order', async () => {
    const cards = [
      storedCard('火', 'A', { state: 'REVIEW', interval: 1_440, due: NOON - 1 * MINUTE, reviewCount: 1 }),
      storedCard('山', 'A', { state: 'REVIEW', interval: 1_440, due: NOON - 9 * MINUTE, reviewCount: 1 }),
      storedCard('水', 'A', { state: 'REVIEW', interval: 1_440, due: NOON - 9 * MINUTE, reviewCount: 1 }),
    ];
    const scrambled = Object.assign(Object.create(repos.review) as Repositories['review'], {
      getDueCards: () => Promise.resolve([cards[0]!, cards[2]!, cards[1]!]),
    });
    const plan = await planSession(deps({ review: scrambled, limits: { newCards: 0, reviews: 5 } }));
    const expected = [cards[1]!, cards[2]!].sort((a, b) => (a.id < b.id ? -1 : 1)).map((c) => c.id).concat(cards[0]!.id);
    expect(ids(plan)).toEqual(expected);
  });
});

describe('determinism', () => {
  it('identical dataset, state, now and limits give an identical queue, every time', async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW', interval: 1_440, due: NOON - MINUTE, reviewCount: 1 }));
    const runs = [];
    for (let i = 0; i < 3; i += 1) runs.push(ids(await planSession(deps())));
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });
});

describe('SRS scheduling stays instant-based whatever the time zone', () => {
  it('the same stored due instants select the same cards in every zone', async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW', interval: 1_440, due: NOON, reviewCount: 1 }));
    const original = process.env.TZ;
    try {
      const results: string[][] = [];
      for (const zone of ['Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Auckland']) {
        process.env.TZ = zone;
        results.push(ids(await planSession(deps({ limits: { newCards: 0, reviews: 20 } }, NOON))));
      }
      expect(results.every((r) => r.length === 1 && r[0] === cardId('水', 'A'))).toBe(true);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
