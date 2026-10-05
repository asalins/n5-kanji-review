import { readFileSync } from 'node:fs';
import { thaiDatasetFileSchema } from '../../src/services/content/datasetFiles';
import { makeKanjiId } from '../../src/utils/kanjiId';

/**
 * Expected Thai for a kanji, derived from the CURRENT n5.th.json and the approved rule
 * (shown only when reviewed === true AND ambiguous === false AND it has a meaning).
 * Tests use this instead of assuming the review state of the file.
 */
const thai = thaiDatasetFileSchema.parse(JSON.parse(readFileSync('data/kanji/n5.th.json', 'utf8')));
export function approvedThai(character: string): string[] {
  const entry = thai.entries.find((e) => e.kanjiId === makeKanjiId(character));
  return entry !== undefined && entry.reviewed && !entry.ambiguous && entry.meaningsTh.length > 0 ? [...entry.meaningsTh] : [];
}
