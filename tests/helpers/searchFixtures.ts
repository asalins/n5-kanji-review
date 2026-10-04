import type { Kanji, KanjiReading } from '../../src/types/entities';
import { makeKanjiId } from '../../src/utils/kanjiId';
import type { SearchCorpus } from '../../src/services/kanjiSearch/searchKanji';

/** SYNTHETIC kanji (test data only) with readings in the real KANJIDIC2 notation. */
export function k(character: string, en: string[], th: string[] = []): Kanji {
  return { id: makeKanjiId(character), character, level: 'N5', strokeCount: 4, frequency: null, meanings: { en, th } };
}
export function r(character: string, type: 'on' | 'kun', kana: string, romaji: string | null): KanjiReading {
  return { kanjiId: makeKanjiId(character), type, kana, romaji };
}

export const WATER = k('水', ['water'], ['น้ำ']);
export const DAY = k('日', ['day', 'sun', 'Japan'], ['พระอาทิตย์']);
export const STUDY = k('学', ['study', 'learning', 'science'], ['โรงเรียน']);
export const ONE = k('一', ['one', 'one radical (no.1)']);
export const TEN = k('十', ['ten']);

export const READINGS: readonly KanjiReading[] = [
  r('水', 'on', 'スイ', 'sui'),
  r('水', 'kun', 'みず', 'mizu'),
  r('水', 'kun', 'みず-', 'mizu'),
  r('日', 'on', 'ニチ', 'nichi'),
  r('日', 'on', 'ジツ', 'jitsu'),
  r('日', 'kun', 'ひ', 'hi'),
  r('日', 'kun', '-び', 'bi'),
  r('学', 'on', 'ガク', 'gaku'),
  r('学', 'kun', 'まな.ぶ', 'manabu'),
  r('一', 'on', 'イチ', 'ichi'),
  r('一', 'kun', 'ひと-', 'hito'),
  r('一', 'kun', 'ひと.つ', 'hitotsu'),
  r('十', 'on', 'ジッ', null),
  r('十', 'on', 'ジュウ', 'juu'),
];

/** Project order: 一 十 日 水 学 (deliberately not the codepoint or id order). */
export const ORDER: readonly string[] = ['一', '十', '日', '水', '学'].map(makeKanjiId);

export function corpus(over: Partial<SearchCorpus> = {}): SearchCorpus {
  return { kanji: [WATER, DAY, STUDY, ONE, TEN], readings: READINGS, cards: [], order: ORDER, ...over };
}
