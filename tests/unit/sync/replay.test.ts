import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAppServices } from '../../../src/app/bootstrap';
import { validateBackup } from '../../../src/services/backup/validateBackup';
import { srsV1 } from '../../../src/services/srs';
import { checkReplay, replayAll, replayCard } from '../../../src/services/sync/replay';
import type { ReviewCard, ReviewLog, ReviewRating, StudyMode } from '../../../src/types/entities';
import { openRealRepositories } from '../../helpers/realData';

const RATINGS: readonly ReviewRating[] = ['AGAIN', 'HARD', 'GOOD', 'EASY'];
const MODES: readonly StudyMode[] = ['A', 'B', 'C', 'D'];

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** What the orchestrator does on every review (new card at the first answer, then updateCardState). */
function simulate(seed: number, cards: number, reviews: number): { cards: ReviewCard[]; logs: ReviewLog[] } {
  const random = rng(seed);
  const state = new Map<string, ReviewCard>();
  const logs: ReviewLog[] = [];
  let now = 1_790_000_000_000;
  for (let i = 0; i < reviews; i += 1) {
    now += Math.floor(random() * 3 * 86_400_000) + 1; // strictly increasing per device
    const code = 0x4e00 + Math.floor(random() * cards);
    const item = { itemType: 'kanji' as const, itemId: `kanji:U+${code.toString(16).toUpperCase()}` };
    const mode = MODES[Math.floor(random() * MODES.length)]!;
    const id = `kanji:${item.itemId}:${mode}`;
    const before = state.get(id) ?? srsV1.createNewCard(item, mode, now);
    const rating = RATINGS[Math.floor(random() * RATINGS.length)]!;
    const result = srsV1.updateCardState(before, rating, now);
    state.set(id, result.card);
    logs.push({ id: `log:${seed}-${i}`, cardId: id, rating, reviewedAt: now, durationMs: 1000, stateBefore: result.stateBefore, stateAfter: result.stateAfter, datasetVersion: 'n5', deviceId: null, originalId: null });
  }
  return { cards: [...state.values()], logs };
}

describe('L3a proof (D4): ReviewCards are reproduced exactly from their logs', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('random history #%i (2,000 reviews over 40 kanji × 4 modes): every field of every card', (seed) => {
    const { cards, logs } = simulate(seed, 40, 2_000);
    const report = checkReplay(cards, logs);
    expect(report.differing).toEqual([]);
    expect(report.matching).toHaveLength(cards.length);
    expect(report.withoutLogs).toEqual([]);
  });

  it('the order the logs arrive in does not matter (devices merge in any order)', () => {
    const { logs } = simulate(42, 20, 600);
    const shuffled = [...logs].sort(() => 0.5 - rng(7)());
    expect([...replayAll(shuffled).entries()].sort()).toEqual([...replayAll(logs).entries()].sort());
  });

  it('the real backup written by the production app (c6fdf23) replays to its stored cards', () => {
    const backup = validateBackup(JSON.parse(readFileSync('tests/fixtures/production-backup-v1.json', 'utf8')));
    const report = checkReplay(backup.data.reviewCards, backup.data.reviewLogs);
    expect(report.differing).toEqual([]);
    expect(report.matching).toHaveLength(backup.data.reviewCards.length);
  });

  it('reviews recorded through the real app wiring (orchestrator + IndexedDB) replay to the stored cards', async () => {
    const real = await openRealRepositories();
    try {
      const services = buildAppServices(real.repos);
      const t0 = Date.UTC(2026, 9, 17, 3);
      const plan: [string, StudyMode, ReviewRating, number][] = [
        ['U+6C34', 'A', 'GOOD', 0], ['U+6C34', 'A', 'AGAIN', 600_000], ['U+6C34', 'A', 'GOOD', 86_400_000],
        ['U+706B', 'B', 'EASY', 60_000], ['U+5C71', 'C', 'HARD', 120_000], ['U+5C71', 'C', 'GOOD', 3 * 86_400_000],
      ];
      for (const [cp, mode, rating, dt] of plan) {
        await services.reviewOrchestrator!.submit({ item: { itemType: 'kanji', itemId: `kanji:${cp}` }, mode, rating, answeredAt: t0 + dt, durationMs: 1 });
      }
      const data = await real.repos.backup.readUserData();
      const report = checkReplay(data.reviewCards, data.reviewLogs);
      expect(report.differing).toEqual([]);
      expect(report.matching).toHaveLength(3);
    } finally {
      await real.dispose();
    }
  });

  it('the check reports what does NOT match (so L3b can keep a stored base card), cards without logs and orphan logs', () => {
    const { cards, logs } = simulate(3, 5, 40);
    const tampered = cards.map((c, i) => (i === 0 ? { ...c, ease: c.ease + 1 } : c));
    const newCard = srsV1.createNewCard({ itemType: 'kanji', itemId: 'kanji:U+9F8D' }, 'A', 1);
    const report = checkReplay([...tampered.slice(0, -1), newCard], logs);
    expect(report.differing).toEqual([{ cardId: cards[0]!.id, fields: ['ease'] }]);
    expect(report.withoutLogs).toEqual([newCard.id]);
    expect(report.orphanLogCards).toEqual([cards.at(-1)!.id]);
  });

  it('a malformed card id is not replayed', () => {
    expect(replayCard('nonsense', simulate(1, 1, 1).logs)).toBeNull();
  });
});
