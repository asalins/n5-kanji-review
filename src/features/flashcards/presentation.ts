import type { Kanji, KanjiReading, StudyMode } from '../../types/entities';
import { assertNever } from '../../utils/assertNever';

/**
 * Presentation policy (the source dataset is never changed):
 *  - Meanings: source order, trimmed, exact duplicates removed, at most MAX_DISPLAYED_MEANINGS per language.
 *    The source lists the main meanings first. A shown meaning is a selection, not "the" meaning.
 *  - Thai meanings are shown only when present; English is always available as the reference.
 *  - Readings: grouped On'yomi / Kun'yomi, kana shown exactly as stored (notation such as "-" and "."
 *    is kept). Plain readings (no notation marks) are listed before marked ones; otherwise the order
 *    is the order returned by the repository (the content store orders by key, not source order).
 *  - Romaji is shown only when it is a string.
 */
export const MAX_DISPLAYED_MEANINGS = 3;

export interface KanjiCardData {
  readonly kanji: Kanji;
  readonly readings: readonly KanjiReading[];
}

export interface DisplayMeanings {
  readonly th: readonly string[];
  readonly en: readonly string[];
}

export interface ReadingView {
  readonly kana: string;
  readonly romaji: string | null;
}

export interface ReadingGroups {
  readonly on: readonly ReadingView[];
  readonly kun: readonly ReadingView[];
}

export type FrontPrompt =
  | { readonly kind: 'kanji'; readonly text: string }
  | { readonly kind: 'meaning'; readonly lines: readonly string[] }
  | { readonly kind: 'reading'; readonly kana: string };

function cleanList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed !== '' && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result.slice(0, MAX_DISPLAYED_MEANINGS);
}

export function selectMeanings(kanji: Kanji): DisplayMeanings {
  return { th: cleanList(kanji.meanings.th), en: cleanList(kanji.meanings.en) };
}

/** Meaning lines used as the question in Mode B: Thai when available, otherwise English. */
export function promptMeanings(meanings: DisplayMeanings): readonly string[] {
  return meanings.th.length > 0 ? meanings.th : meanings.en;
}

const hasNotationMarks = (kana: string): boolean => kana.includes('-') || kana.includes('.');

function toViews(readings: readonly KanjiReading[]): ReadingView[] {
  const seen = new Set<string>();
  const views: ReadingView[] = [];
  for (const reading of readings) {
    if (seen.has(reading.kana)) continue;
    seen.add(reading.kana);
    views.push({ kana: reading.kana, romaji: reading.romaji === null || reading.romaji === '' ? null : reading.romaji });
  }
  // stable sort: plain readings first, relative order otherwise unchanged
  return views
    .map((view, index) => ({ view, index }))
    .sort((a, b) => Number(hasNotationMarks(a.view.kana)) - Number(hasNotationMarks(b.view.kana)) || a.index - b.index)
    .map(({ view }) => view);
}

export function groupReadings(readings: readonly KanjiReading[]): ReadingGroups {
  return {
    on: toViews(readings.filter((r) => r.type === 'on')),
    kun: toViews(readings.filter((r) => r.type === 'kun')),
  };
}

/** The reading used as the question in Mode D: the first kun reading, else the first on reading. */
export function pickPromptReading(groups: ReadingGroups): ReadingView | null {
  return groups.kun[0] ?? groups.on[0] ?? null;
}

/** A card can be asked in a mode only if that mode's question and answer data exist. */
export function isCardPlayable(mode: StudyMode, data: KanjiCardData): boolean {
  const meanings = selectMeanings(data.kanji);
  const groups = groupReadings(data.readings);
  switch (mode) {
    case 'A':
    case 'B':
      return meanings.th.length + meanings.en.length > 0;
    case 'C':
      return groups.on.length + groups.kun.length > 0;
    case 'D':
      return pickPromptReading(groups) !== null;
    default:
      return assertNever(mode);
  }
}

/** What the front of the card shows. Never contains the answer for the mode. */
export function buildFront(mode: StudyMode, data: KanjiCardData): FrontPrompt {
  switch (mode) {
    case 'A':
    case 'C':
      return { kind: 'kanji', text: data.kanji.character };
    case 'B':
      return { kind: 'meaning', lines: promptMeanings(selectMeanings(data.kanji)) };
    case 'D': {
      const reading = pickPromptReading(groupReadings(data.readings));
      if (reading === null) throw new Error('Mode D requires a reading; check isCardPlayable first');
      return { kind: 'reading', kana: reading.kana };
    }
    default:
      return assertNever(mode);
  }
}
