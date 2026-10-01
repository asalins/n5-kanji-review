import { makeKanjiId } from '../../utils/kanjiId';
import type { DatasetKanji } from './datasetFiles';
import type { KanjiReading } from '../../types/entities';

export type IntegrityCode =
  | 'DUPLICATE_ID'
  | 'DUPLICATE_CHARACTER'
  | 'DUPLICATE_READING'
  | 'ORPHAN_READING'
  | 'ID_CHARACTER_MISMATCH'
  | 'KANJI_WITHOUT_READING';

export interface IntegrityIssue {
  readonly code: IntegrityCode;
  readonly subject: string;
}

/** Pure structural checks that every dataset must pass. Reports problems; never repairs them. */
export function checkIntegrity(
  kanji: readonly DatasetKanji[],
  readings: readonly KanjiReading[],
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const ids = new Set<string>();
  const characters = new Set<string>();

  for (const k of kanji) {
    if (ids.has(k.id)) issues.push({ code: 'DUPLICATE_ID', subject: k.id });
    ids.add(k.id);
    if (characters.has(k.character)) issues.push({ code: 'DUPLICATE_CHARACTER', subject: k.character });
    characters.add(k.character);
    if (k.id !== makeKanjiId(k.character)) issues.push({ code: 'ID_CHARACTER_MISMATCH', subject: k.id });
  }

  const readingKeys = new Set<string>();
  const kanjiWithReading = new Set<string>();
  for (const r of readings) {
    const key = `${r.kanjiId}|${r.type}|${r.kana}`;
    if (readingKeys.has(key)) issues.push({ code: 'DUPLICATE_READING', subject: key });
    readingKeys.add(key);
    if (!ids.has(r.kanjiId)) issues.push({ code: 'ORPHAN_READING', subject: key });
    kanjiWithReading.add(r.kanjiId);
  }
  for (const k of kanji) {
    if (!kanjiWithReading.has(k.id)) issues.push({ code: 'KANJI_WITHOUT_READING', subject: k.id });
  }
  return issues;
}
