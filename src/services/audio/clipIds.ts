import type { ReadingType } from '../../types/common';

/** Stable clip id for a kanji reading, e.g. `reading:kanji:U+5B66:on:ガク`. Matches the manifest `id`. */
export function readingClipId(kanjiId: string, type: ReadingType, kana: string): string {
  return `reading:${kanjiId}:${type}:${kana}`;
}

/**
 * Text spoken by the device voice for a KANJIDIC2 reading. Display keeps the notation; speech drops it:
 * '.' marks okurigana (まな.ぶ → まなぶ), '-' marks a prefix/suffix form (-み → み). Kana only, so the
 * voice never has to guess a kanji reading.
 */
export function readingSpeechText(kana: string): string {
  return kana.replace(/[.\-]/g, '');
}
