import { STUDY_MODES, type LearningState, type ReviewCard } from '../../types/entities';

/** Learned Kanji: at least one card of that item is no longer NEW. Counted per itemId, not per card. */
export function calculateLearnedKanji(cards: readonly ReviewCard[]): number {
  const learned = new Set<string>();
  for (const card of cards) {
    if (card.itemType === 'kanji' && card.state !== 'NEW') learned.add(card.itemId);
  }
  return learned.size;
}

/** Mastered Kanji: every study mode has a card and every one of them is MASTERED. Missing cards are never created. */
export function calculateMasteredKanji(cards: readonly ReviewCard[]): number {
  const byItem = new Map<string, Map<string, LearningState>>();
  for (const card of cards) {
    if (card.itemType !== 'kanji') continue;
    const modes = byItem.get(card.itemId) ?? new Map<string, LearningState>();
    modes.set(card.mode, card.state);
    byItem.set(card.itemId, modes);
  }
  let mastered = 0;
  for (const modes of byItem.values()) {
    if (STUDY_MODES.every((mode) => modes.get(mode) === 'MASTERED')) mastered += 1;
  }
  return mastered;
}

/** Review Cards (not Kanji) per state. */
export function countCardsByState(cards: readonly ReviewCard[], states: readonly LearningState[]): Record<LearningState, number> {
  const counts = Object.fromEntries(states.map((state) => [state, 0])) as Record<LearningState, number>;
  for (const card of cards) counts[card.state] += 1;
  return counts;
}
