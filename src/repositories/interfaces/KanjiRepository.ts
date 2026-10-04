import type { ExampleSentence, JlptLevel, Kanji, KanjiReading, Vocabulary } from '../../types/entities';

/** Filters are defined in Phase 8. */
export interface KanjiSearchFilters {
  readonly level?: JlptLevel;
}

/** Read-only access to the canonical content dataset. Users never modify content through this. */
export interface KanjiRepository {
  getById(id: string): Promise<Kanji | null>;
  getByLevel(level: JlptLevel): Promise<readonly Kanji[]>;
  search(query: string, filters?: KanjiSearchFilters): Promise<readonly Kanji[]>;
  /** Version of the dataset currently loaded into the content stores, or null if none. */
  getDatasetVersion(): Promise<string | null>;
  getReadings(kanjiId: string): Promise<readonly KanjiReading[]>;
  /** Every reading of every kanji in one read (for in-memory search); sorted by kanjiId, type, kana. */
  getAllReadings(): Promise<readonly KanjiReading[]>;
  getVocabulary(kanjiId: string): Promise<readonly Vocabulary[]>;
  getExamples(kanjiId: string): Promise<readonly ExampleSentence[]>;
}
