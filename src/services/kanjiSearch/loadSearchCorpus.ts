import type { KanjiRepository, ReviewRepository } from '../../repositories/interfaces';
import { LEARNING_STATES, type JlptLevel } from '../../types/entities';
import { DatasetUnavailableError } from '../session/sessionEngine';
import type { NewItemSource } from '../session/types';
import type { SearchCorpus } from './searchKanji';

/** The level searched. The dataset only has N5; the repository already takes a level for later. */
export const SEARCH_LEVEL: JlptLevel = 'N5';

export interface SearchCorpusDeps {
  readonly kanji: Pick<KanjiRepository, 'getByLevel' | 'getAllReadings'>;
  readonly review: Pick<ReviewRepository, 'getCardsByStates'>;
  /** Project N5 list order. Optional: without it, kanji are ordered by id. */
  readonly newItems?: NewItemSource;
}

/**
 * Loads the whole corpus with a fixed number of reads (kanji, readings, cards, list order): no query per kanji.
 * Read-only. A dataset that is not loaded is an error, never an empty result.
 */
export async function loadSearchCorpus(deps: SearchCorpusDeps): Promise<SearchCorpus> {
  const [kanji, readings, cards, items] = await Promise.all([
    deps.kanji.getByLevel(SEARCH_LEVEL),
    deps.kanji.getAllReadings(),
    deps.review.getCardsByStates(LEARNING_STATES),
    deps.newItems?.getOrderedItems() ?? Promise.resolve([]),
  ]);
  if (kanji.length === 0) {
    throw new DatasetUnavailableError('The kanji dataset is not available in the content stores');
  }
  return { kanji, readings, cards, order: items.filter((item) => item.itemType === 'kanji').map((item) => item.itemId) };
}
