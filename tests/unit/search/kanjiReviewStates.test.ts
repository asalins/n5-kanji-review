import { describe, expect, it } from 'vitest';
import { evaluateKanjiReviewState, groupCardsByKanji, hasDueCard, isLearnedKanji, isMasteredKanji, matchesStateFilter } from '../../../src/services/kanjiSearch/kanjiReviewStates';
import { calculateLearnedKanji, calculateMasteredKanji } from '../../../src/services/statistics/kanjiProgress';
import type { LearningState } from '../../../src/types/entities';
import { NOON, storedCard } from '../../helpers/sessionFixtures';

const card = (c: string, mode: 'A' | 'B' | 'C' | 'D', state: LearningState, due = NOON + 1) => storedCard(c, mode, { state, due });
const four = (c: string, s: [LearningState, LearningState, LearningState, LearningState]) => (['A', 'B', 'C', 'D'] as const).map((m, i) => card(c, m, s[i]!));
const state = (cards: ReturnType<typeof card>[]) => evaluateKanjiReviewState(cards);

describe('Kanji-level state (Phase 7 semantics, applied per kanji)', () => {
  it('no cards: not learned, not mastered, matches only New / All', () => {
    const s = state([]);
    expect([s.learned, s.mastered]).toEqual([false, false]);
    expect(matchesStateFilter(s, 'NEW')).toBe(true);
    expect(matchesStateFilter(s, 'ALL')).toBe(true);
    for (const f of ['LEARNING', 'REVIEW', 'RELEARNING', 'MASTERED'] as const) expect(matchesStateFilter(s, f)).toBe(false);
  });
  it('only NEW cards: still New (never learned)', () => {
    const s = state([card('水', 'A', 'NEW'), card('水', 'B', 'NEW')]);
    expect(s.learned).toBe(false);
    expect(matchesStateFilter(s, 'NEW')).toBe(true);
  });
  it('one mode reviewed (A = LEARNING, B-D NEW) is Learned and no longer New', () => {
    const s = state(four('水', ['LEARNING', 'NEW', 'NEW', 'NEW']));
    expect(s.learned).toBe(true);
    expect(matchesStateFilter(s, 'NEW')).toBe(false);
    expect(matchesStateFilter(s, 'LEARNING')).toBe(true);
  });
  it('four modes in mixed states: the states overlap (A REVIEW + B LEARNING passes both filters)', () => {
    const s = state(four('水', ['REVIEW', 'LEARNING', 'NEW', 'NEW']));
    expect(matchesStateFilter(s, 'REVIEW')).toBe(true);
    expect(matchesStateFilter(s, 'LEARNING')).toBe(true);
    expect(matchesStateFilter(s, 'RELEARNING')).toBe(false);
    expect(matchesStateFilter(s, 'MASTERED')).toBe(false);
  });
  it('RELEARNING: at least one RELEARNING card', () => {
    expect(matchesStateFilter(state(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'RELEARNING'])), 'RELEARNING')).toBe(true);
  });
  it('Mastered Kanji only when A-D all exist and all are MASTERED', () => {
    expect(isMasteredKanji(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'MASTERED']))).toBe(true);
    expect(isMasteredKanji(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'REVIEW']))).toBe(false);
    expect(isMasteredKanji(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'NEW']))).toBe(false);
    expect(isMasteredKanji([card('水', 'A', 'MASTERED'), card('水', 'B', 'MASTERED'), card('水', 'C', 'MASTERED')])).toBe(false); // D missing
    expect(matchesStateFilter(state(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'MASTERED'])), 'MASTERED')).toBe(true);
    expect(matchesStateFilter(state(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'REVIEW'])), 'MASTERED')).toBe(false);
  });
  it('a Mastered Kanji is not "Learning" and has no LEARNING card anyway', () => {
    expect(matchesStateFilter(state(four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'MASTERED'])), 'LEARNING')).toBe(false);
  });
  it('isLearnedKanji mirrors Phase 7: any card that is not NEW', () => {
    expect(isLearnedKanji([card('水', 'A', 'NEW')])).toBe(false);
    expect(isLearnedKanji([card('水', 'A', 'NEW'), card('水', 'B', 'RELEARNING')])).toBe(true);
  });
});

describe('cross-check with the Phase 7 statistics (same semantics, no second definition drifting)', () => {
  it('per-kanji Learned/Mastered flags add up to the Phase 7 counts for the same cards', () => {
    const cards = [
      ...four('水', ['MASTERED', 'MASTERED', 'MASTERED', 'MASTERED']),
      ...four('火', ['MASTERED', 'REVIEW', 'MASTERED', 'MASTERED']),
      ...four('山', ['NEW', 'NEW', 'NEW', 'NEW']),
      ...four('木', ['LEARNING', 'NEW', 'NEW', 'NEW']),
      card('金', 'A', 'MASTERED'),
      ...four('土', ['RELEARNING', 'MASTERED', 'MASTERED', 'MASTERED']),
      ...four('日', ['MASTERED', 'MASTERED', 'MASTERED', 'MASTERED']),
    ];
    const perKanji = [...groupCardsByKanji(cards).values()].map(evaluateKanjiReviewState);
    expect(perKanji.filter((s) => s.learned).length).toBe(calculateLearnedKanji(cards));
    expect(perKanji.filter((s) => s.mastered).length).toBe(calculateMasteredKanji(cards));
    expect(calculateMasteredKanji(cards)).toBe(2);
  });
  it('groups every card once, in a single pass, by kanji', () => {
    const cards = [...four('水', ['NEW', 'NEW', 'NEW', 'NEW']), ...four('火', ['NEW', 'NEW', 'NEW', 'NEW'])];
    const grouped = groupCardsByKanji(cards);
    expect([...grouped.values()].map((g) => g.length)).toEqual([4, 4]);
  });
});

describe('Due at kanji level: at least one card passes isDueCard (the single Due definition)', () => {
  const T = NOON;
  it('one due card among four modes makes the kanji due', () => {
    const cards = four('水', ['REVIEW', 'REVIEW', 'REVIEW', 'REVIEW']).map((c, i) => ({ ...c, due: i === 2 ? T - 1 : T + 1_000 }));
    expect(hasDueCard(cards, T)).toBe(true);
  });
  it('all cards in the future: not due', () => {
    expect(hasDueCard(four('水', ['REVIEW', 'LEARNING', 'MASTERED', 'RELEARNING']), T)).toBe(false);
  });
  it('NEW with due <= now is NOT due', () => {
    expect(hasDueCard([card('水', 'A', 'NEW', T - 10)], T)).toBe(false);
  });
  it.each(['LEARNING', 'REVIEW', 'RELEARNING', 'MASTERED'] as const)('%s with due <= now is due', (s) => {
    expect(hasDueCard([card('水', 'A', s, T)], T)).toBe(true);
  });
  it('no cards: not due', () => expect(hasDueCard([], T)).toBe(false));
});
