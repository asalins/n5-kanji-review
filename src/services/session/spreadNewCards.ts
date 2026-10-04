import type { PlannedCard } from './types';

/**
 * Presentation order of the NEW cards of one session (Phase 12, approved): the same cards, only reordered so
 * that two cards of the same kanji are not next to each other (A of 水 would otherwise give away B of 水).
 *
 * Deterministic greedy: at each step take the next card of the kanji with the most cards left, skipping the
 * kanji just shown; ties go to the kanji that came first (Project N5 order). Within one kanji the modes keep
 * their order (A, B, C, D). When adjacency cannot be avoided (one kanji left), the remaining cards follow in order.
 */
export function spreadNewCards(cards: readonly PlannedCard[]): PlannedCard[] {
  const groups: PlannedCard[][] = [];
  const index = new Map<string, number>();
  for (const planned of cards) {
    const key = `${planned.card.itemType}:${planned.card.itemId}`;
    let at = index.get(key);
    if (at === undefined) {
      at = groups.length;
      index.set(key, at);
      groups.push([]);
    }
    groups[at]!.push(planned);
  }

  const result: PlannedCard[] = [];
  let last = -1;
  while (result.length < cards.length) {
    let pick = -1;
    for (let g = 0; g < groups.length; g += 1) {
      if (groups[g]!.length === 0 || g === last) continue;
      if (pick === -1 || groups[g]!.length > groups[pick]!.length) pick = g;
    }
    if (pick === -1) pick = last; // only the last kanji has cards left: adjacency is unavoidable
    result.push(groups[pick]!.shift()!);
    last = pick;
  }
  return result;
}
