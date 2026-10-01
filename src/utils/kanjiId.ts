/** Kanji id format from Phase 0: `kanji:U+<UPPERCASE HEX CODEPOINT>`, e.g. kanji:U+6C34. */
export function makeKanjiId(character: string): string {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    throw new Error('Cannot build a kanji id from an empty string');
  }
  return `kanji:U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}
