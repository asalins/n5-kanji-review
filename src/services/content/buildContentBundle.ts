import type { ContentBundle } from '../../types/entities';
import type { KanjiDatasetFile, ThaiDatasetFile } from './datasetFiles';

export interface ThaiMergeReport {
  /** Kanji with no usable Thai meaning (no entry, empty, or flagged ambiguous). */
  readonly missingThai: readonly string[];
  /** AMBIGUOUS THAI MEANING: flagged by a reviewer; Thai text is withheld until resolved. */
  readonly ambiguousThai: readonly string[];
  /** Thai entries whose kanjiId is not in the dataset. */
  readonly unknownThai: readonly string[];
  readonly duplicateThai: readonly string[];
}

export interface MergeResult {
  readonly bundle: ContentBundle;
  readonly thai: ThaiMergeReport;
}

/**
 * Merges the source dataset with the separate Thai file into the app's ContentBundle.
 * Nothing is invented: a kanji without usable Thai gets `th: []` and is reported.
 * Vocabulary and example sentences are out of Phase 3 scope and stay empty.
 */
export function buildContentBundle(dataset: KanjiDatasetFile, thai: ThaiDatasetFile): MergeResult {
  const byId = new Map<string, ThaiDatasetFile['entries'][number]>();
  const duplicateThai: string[] = [];
  for (const entry of thai.entries) {
    if (byId.has(entry.kanjiId)) duplicateThai.push(entry.kanjiId);
    else byId.set(entry.kanjiId, entry);
  }

  const knownIds = new Set(dataset.kanji.map((k) => k.id));
  const unknownThai = [...byId.keys()].filter((kanjiId) => !knownIds.has(kanjiId));
  const missingThai: string[] = [];
  const ambiguousThai: string[] = [];

  const kanji = dataset.kanji.map((k) => {
    const entry = byId.get(k.id);
    const usable = entry !== undefined && !entry.ambiguous && entry.meaningsTh.length > 0;
    if (entry?.ambiguous) ambiguousThai.push(k.id);
    if (!usable) missingThai.push(k.id);
    return { ...k, meanings: { en: k.meanings.en, th: usable ? entry.meaningsTh : [] } };
  });

  return {
    bundle: { kanji, readings: dataset.readings, vocabulary: [], examples: [] },
    thai: { missingThai, ambiguousThai, unknownThai, duplicateThai },
  };
}
