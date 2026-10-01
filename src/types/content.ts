import type { JlptLevel, ReadingType } from './common';

/** Content entities are read-only for the application: they come from a versioned dataset. */

export interface Kanji {
  readonly id: string;
  readonly character: string;
  readonly level: JlptLevel;
  readonly strokeCount: number;
  /** Frequency rank from the dataset; null when the source has none. */
  readonly frequency: number | null;
  readonly meanings: {
    readonly en: readonly string[];
    readonly th: readonly string[];
  };
}

/** Identified by (kanjiId, type, kana). */
export interface KanjiReading {
  readonly kanjiId: string;
  readonly type: ReadingType;
  readonly kana: string;
  readonly romaji: string;
}

export interface Vocabulary {
  readonly id: string;
  readonly kanjiIds: readonly string[];
  readonly word: string;
  readonly reading: string;
  readonly meaningEn: readonly string[];
  readonly meaningTh: readonly string[];
}

export interface ExampleSentence {
  readonly id: string;
  readonly text: string;
  readonly reading: string;
  readonly meaningTh: string;
  readonly meaningEn: string;
  readonly vocabIds: readonly string[];
}

/** A unit of content handed to the (internal) ContentWriter by the dataset loader. */
export interface ContentBundle {
  readonly kanji: readonly Kanji[];
  readonly readings: readonly KanjiReading[];
  readonly vocabulary: readonly Vocabulary[];
  readonly examples: readonly ExampleSentence[];
}
