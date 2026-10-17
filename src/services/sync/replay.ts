import { buildReviewCardId } from '../../utils/reviewCardId';
import { srsV1 } from '../srs';
import type { ItemRef, ReviewCard, ReviewLog, StudyMode } from '../../types/entities';

/**
 * L3 (D4): a ReviewCard is DERIVED from its ReviewLogs. Replaying the logs of one card through srsV1 —
 * createNewCard at the first review, then updateCardState per log, in (reviewedAt, id) order — yields the card.
 * Two devices holding the same logs therefore hold the same card, without trusting lastReviewed / reviewCount.
 * Pure; nothing is stored here.
 */

const compare = (a: ReviewLog, b: ReviewLog) => a.reviewedAt - b.reviewedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** cardId = `${itemType}:${itemId}:${mode}`; itemId itself contains ':' (e.g. kanji:U+6C34). */
function parseCardId(cardId: string): { item: ItemRef; mode: StudyMode } | null {
  const first = cardId.indexOf(':');
  const last = cardId.lastIndexOf(':');
  if (first <= 0 || last <= first) return null;
  const item = { itemType: cardId.slice(0, first), itemId: cardId.slice(first + 1, last) } as ItemRef;
  const mode = cardId.slice(last + 1) as StudyMode;
  return buildReviewCardId(item.itemType, item.itemId, mode) === cardId ? { item, mode } : null;
}

export function replayCard(cardId: string, logs: readonly ReviewLog[]): ReviewCard | null {
  const parsed = parseCardId(cardId);
  const ordered = logs.filter((l) => l.cardId === cardId).slice().sort(compare);
  if (parsed === null || ordered.length === 0) return null;
  let card = srsV1.createNewCard(parsed.item, parsed.mode, ordered[0]!.reviewedAt);
  for (const log of ordered) card = srsV1.updateCardState(card, log.rating, log.reviewedAt).card;
  return card;
}

/** Every card that has at least one log, replayed. */
export function replayAll(logs: readonly ReviewLog[]): Map<string, ReviewCard> {
  const byCard = new Map<string, ReviewLog[]>();
  for (const log of logs) byCard.set(log.cardId, [...(byCard.get(log.cardId) ?? []), log]);
  const out = new Map<string, ReviewCard>();
  for (const [cardId, cardLogs] of byCard) {
    const card = replayCard(cardId, cardLogs);
    if (card !== null) out.set(cardId, card);
  }
  return out;
}

export interface ReplayReport {
  /** Cards whose replay equals the stored card in every field. */
  readonly matching: readonly string[];
  /** Cards with logs whose replay differs (need a "base" card in L3b); with the differing fields. */
  readonly differing: readonly { readonly cardId: string; readonly fields: readonly string[] }[];
  /** Stored cards without any log (e.g. NEW cards): not replayable, kept as they are. */
  readonly withoutLogs: readonly string[];
  /** Logs whose card is not stored. */
  readonly orphanLogCards: readonly string[];
}

/** L3a proof: does replay(logs) reproduce the stored cards exactly? */
export function checkReplay(cards: readonly ReviewCard[], logs: readonly ReviewLog[]): ReplayReport {
  const replayed = replayAll(logs);
  const stored = new Map(cards.map((c) => [c.id, c]));
  const matching: string[] = [];
  const differing: { cardId: string; fields: string[] }[] = [];
  const withoutLogs: string[] = [];
  for (const card of cards) {
    const again = replayed.get(card.id);
    if (again === undefined) {
      withoutLogs.push(card.id);
      continue;
    }
    const fields = (Object.keys(card) as (keyof ReviewCard)[]).filter((k) => card[k] !== again[k]);
    if (fields.length === 0) matching.push(card.id);
    else differing.push({ cardId: card.id, fields });
  }
  const orphanLogCards = [...replayed.keys()].filter((id) => !stored.has(id));
  return { matching, differing, withoutLogs, orphanLogCards };
}
