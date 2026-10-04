import { STUDY_MODES, type LearningState, type ReviewCard } from '../../types/entities';
import { isDueCard } from '../../utils/dueCard';

/**
 * Kanji-level meaning of the review data, computed in memory from cards that are already loaded. It applies
 * the Phase 7 definitions to one kanji's cards (a test cross-checks it against the Phase 7 statistics):
 *  - Learned  : at least one of the kanji's cards is not NEW
 *  - Mastered : all four modes (A-D) have a card and every one of them is MASTERED
 * A card's state belongs to the card; one kanji can therefore have several states at once.
 */
export interface KanjiReviewState {
  readonly learned: boolean;
  readonly mastered: boolean;
  /** Which card states occur among the kanji's cards. */
  readonly has: Readonly<Record<LearningState, boolean>>;
}

export type StateFilter = 'ALL' | 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING' | 'MASTERED';

export function isLearnedKanji(cards: readonly ReviewCard[]): boolean {
  return cards.some((card) => card.state !== 'NEW');
}

export function isMasteredKanji(cards: readonly ReviewCard[]): boolean {
  return STUDY_MODES.every((mode) => cards.some((card) => card.mode === mode && card.state === 'MASTERED'));
}

export function evaluateKanjiReviewState(cards: readonly ReviewCard[]): KanjiReviewState {
  const has: Record<LearningState, boolean> = { NEW: false, LEARNING: false, REVIEW: false, RELEARNING: false, MASTERED: false };
  for (const card of cards) has[card.state] = true;
  return { learned: isLearnedKanji(cards), mastered: isMasteredKanji(cards), has };
}

/** One pass over all cards: itemId -> that kanji's cards. Only kanji items. */
export function groupCardsByKanji(cards: readonly ReviewCard[]): Map<string, ReviewCard[]> {
  const byKanji = new Map<string, ReviewCard[]>();
  for (const card of cards) {
    if (card.itemType !== 'kanji') continue;
    const bucket = byKanji.get(card.itemId);
    if (bucket === undefined) byKanji.set(card.itemId, [card]);
    else bucket.push(card);
  }
  return byKanji;
}

/**
 * State filter semantics (all "at least one card" except New and Mastered):
 *  NEW        = not Learned (no card, or only NEW cards)
 *  LEARNING   = at least one LEARNING card, and not a Mastered Kanji
 *  REVIEW     = at least one REVIEW card
 *  RELEARNING = at least one RELEARNING card
 *  MASTERED   = Mastered Kanji (all four modes exist and are MASTERED)
 */
export function matchesStateFilter(state: KanjiReviewState, filter: StateFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'NEW':
      return !state.learned;
    case 'LEARNING':
      return state.has.LEARNING && !state.mastered;
    case 'REVIEW':
      return state.has.REVIEW;
    case 'RELEARNING':
      return state.has.RELEARNING;
    case 'MASTERED':
      return state.mastered;
  }
}

/** A kanji is due when at least one of its cards is due, by the single shared definition (isDueCard). */
export function hasDueCard(cards: readonly ReviewCard[], nowMs: number): boolean {
  return cards.some((card) => isDueCard(card, nowMs));
}
