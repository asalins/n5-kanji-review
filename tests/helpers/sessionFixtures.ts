import { readFileSync } from 'node:fs';
import { itemsFromProjectList } from '../../src/services/content/projectList';
import { newCardFor } from '../../src/services/session/cardFactory';
import type { NewItemSource } from '../../src/services/session/types';
import type { ItemRef, LearningState, ReviewCard, ReviewLog, StudyMode } from '../../src/types/entities';
import { buildReviewCardId } from '../../src/utils/reviewCardId';
import { makeKanjiId } from '../../src/utils/kanjiId';

/** The real Project N5 list file, read from disk exactly as the app bundles it. */
export const realProjectList: NewItemSource = {
  getOrderedItems: () => itemsFromProjectList(JSON.parse(readFileSync('data/lists/n5-list.json', 'utf8'))),
};

export const kanjiItem = (character: string): ItemRef => ({ itemType: 'kanji', itemId: makeKanjiId(character) });
export const cardId = (character: string, mode: StudyMode): string => buildReviewCardId('kanji', makeKanjiId(character), mode);

/** A stored card in a given state (test data only; scheduling values are arbitrary but valid). */
export function storedCard(character: string, mode: StudyMode, over: Partial<ReviewCard> = {}): ReviewCard {
  return { ...newCardFor(kanjiItem(character), mode, 1), ...over };
}

export function logAt(n: number, reviewedAt: number, stateBefore: LearningState, over: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: `log-${n}`,
    cardId: cardId('一', 'A'),
    rating: 'GOOD',
    reviewedAt,
    durationMs: 1_000,
    stateBefore,
    stateAfter: 'LEARNING',
    datasetVersion: 'n5-2026.10.01',
    ...over,
  };
}

/** Local noon on 2026-10-02 (a plain local-time instant, valid in any time zone). */
export const NOON = new Date(2026, 9, 2, 12, 0, 0, 0).getTime();
