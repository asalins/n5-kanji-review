import type { AppDatabase } from '../../services/storage/database';
import { SINGLETON_KEY, STORES } from '../../services/storage/schema';
import {
  contentMetaSchema,
  exampleSentenceSchema,
  kanjiReadingSchema,
  kanjiSchema,
  vocabularySchema,
} from '../../types/schemas';
import type {
  ExampleSentence,
  JlptLevel,
  Kanji,
  KanjiReading,
  Vocabulary,
} from '../../types/entities';
import type { KanjiRepository, KanjiSearchFilters } from '../interfaces';
import { parseRecord, parseRecords, runRepositoryOperation } from './guard';

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function anyIncludes(values: readonly string[], needle: string): boolean {
  return values.some((value) => value.toLowerCase().includes(needle));
}

export class IndexedDbKanjiRepository implements KanjiRepository {
  constructor(private readonly db: AppDatabase) {}

  getById(id: string): Promise<Kanji | null> {
    return runRepositoryOperation('KanjiRepository.getById', async () => {
      const record = await this.db.get(STORES.kanji, id);
      return record === undefined ? null : parseRecord(kanjiSchema, record, 'kanji');
    });
  }

  getByLevel(level: JlptLevel): Promise<readonly Kanji[]> {
    return runRepositoryOperation('KanjiRepository.getByLevel', async () => {
      const records = await this.db.getAllFromIndex(STORES.kanji, 'by-level', level);
      return parseRecords(kanjiSchema, records, 'kanji');
    });
  }

  /**
   * Basic scan-based search (dataset is small). Matches the query as a case-insensitive substring of
   * the character, meanings, readings (kana/romaji) and vocabulary (word/reading/meanings).
   * Kana-script folding and ranking are Phase 8. Empty query returns every kanji (after the level filter).
   */
  search(query: string, filters?: KanjiSearchFilters): Promise<readonly Kanji[]> {
    return runRepositoryOperation('KanjiRepository.search', async () => {
      const needle = normalize(query);
      const level = filters?.level;
      const kanjiRecords =
        level === undefined
          ? await this.db.getAll(STORES.kanji)
          : await this.db.getAllFromIndex(STORES.kanji, 'by-level', level);
      const kanji = parseRecords(kanjiSchema, kanjiRecords, 'kanji');
      if (needle === '') return kanji;

      const readings = parseRecords(
        kanjiReadingSchema,
        await this.db.getAll(STORES.kanjiReadings),
        'kanji reading',
      );
      const vocabulary = parseRecords(
        vocabularySchema,
        await this.db.getAll(STORES.vocabulary),
        'vocabulary',
      );

      const matchedIds = new Set<string>();
      for (const reading of readings) {
        if (anyIncludes(reading.romaji === null ? [reading.kana] : [reading.kana, reading.romaji], needle)) matchedIds.add(reading.kanjiId);
      }
      for (const word of vocabulary) {
        const texts = [word.word, word.reading, ...word.meaningEn, ...word.meaningTh];
        if (anyIncludes(texts, needle)) word.kanjiIds.forEach((id) => matchedIds.add(id));
      }

      return kanji.filter(
        (k) =>
          matchedIds.has(k.id) ||
          anyIncludes([k.character, ...k.meanings.en, ...k.meanings.th], needle),
      );
    });
  }

  getVocabulary(kanjiId: string): Promise<readonly Vocabulary[]> {
    return runRepositoryOperation('KanjiRepository.getVocabulary', async () => {
      const records = await this.db.getAllFromIndex(STORES.vocabulary, 'by-kanjiId', kanjiId);
      return parseRecords(vocabularySchema, records, 'vocabulary');
    });
  }

  /** Sentences linked (via vocabIds) to any vocabulary entry of this kanji, de-duplicated, by id. */
  getExamples(kanjiId: string): Promise<readonly ExampleSentence[]> {
    return runRepositoryOperation('KanjiRepository.getExamples', async () => {
      const vocabulary = await this.getVocabulary(kanjiId);
      const byId = new Map<string, ExampleSentence>();
      for (const word of vocabulary) {
        const records = await this.db.getAllFromIndex(STORES.exampleSentences, 'by-vocabId', word.id);
        for (const sentence of parseRecords(exampleSentenceSchema, records, 'example sentence')) {
          byId.set(sentence.id, sentence);
        }
      }
      return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  getReadings(kanjiId: string): Promise<readonly KanjiReading[]> {
    return runRepositoryOperation('KanjiRepository.getReadings', async () => {
      const records = await this.db.getAllFromIndex(STORES.kanjiReadings, 'by-kanjiId', kanjiId);
      return parseRecords(kanjiReadingSchema, records, 'kanji reading');
    });
  }

  getDatasetVersion(): Promise<string | null> {
    return runRepositoryOperation('KanjiRepository.getDatasetVersion', async () => {
      const record = await this.db.get(STORES.contentMeta, SINGLETON_KEY);
      return record === undefined ? null : parseRecord(contentMetaSchema, record, 'content meta').datasetVersion;
    });
  }
}
