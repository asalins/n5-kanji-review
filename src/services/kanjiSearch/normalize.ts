const KATAKANA_FIRST = 0x30a1; // ァ
const KATAKANA_LAST = 0x30f6; // ヶ
const KATAKANA_TO_HIRAGANA = 0x60;

/** Katakana -> hiragana, for COMPARISON only. Kanji, Latin and the prolonged-sound mark are left alone. */
export function foldKana(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    out += code >= KATAKANA_FIRST && code <= KATAKANA_LAST ? String.fromCodePoint(code - KATAKANA_TO_HIRAGANA) : char;
  }
  return out;
}

/** KANJIDIC2 notation marks ("." okurigana boundary, "-" prefix/suffix) removed, for COMPARISON only. */
export function stripReadingMarks(kana: string): string {
  return kana.replace(/[.-]/g, '');
}

/**
 * The comparable form of any text (a query, a meaning, a reading): Latin lower-cased, katakana folded to
 * hiragana. Kana and kanji are never case-changed. Pure; the stored data is never modified.
 */
export function toComparable(text: string): string {
  return foldKana(text.toLowerCase());
}

export function normalizeQuery(query: string): string {
  return toComparable(query.trim());
}
