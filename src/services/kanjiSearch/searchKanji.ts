import type { Kanji, KanjiReading, ReviewCard } from '../../types/entities';
import { evaluateKanjiReviewState, groupCardsByKanji, hasDueCard, matchesStateFilter, type KanjiReviewState, type StateFilter } from './kanjiReviewStates';
import { normalizeQuery, stripReadingMarks, toComparable } from './normalize';

/** Everything the search needs, loaded once; typing and filtering never query anything. */
export interface SearchCorpus {
  readonly kanji: readonly Kanji[];
  readonly readings: readonly KanjiReading[];
  readonly cards: readonly ReviewCard[];
  /** Kanji ids in Project N5 list order (the tie-break order). Kanji not in it come after, by id. */
  readonly order: readonly string[];
}

export interface SearchableKanji {
  readonly kanji: Kanji;
  readonly readings: readonly KanjiReading[];
  readonly cards: readonly ReviewCard[];
  readonly review: KanjiReviewState;
  readonly position: number;
  /** Comparable forms (never displayed). */
  readonly character: string;
  readonly readingForms: readonly string[];
  readonly meaningForms: readonly string[];
}

export interface SearchQuery {
  readonly text: string;
  readonly state: StateFilter;
  readonly dueOnly: boolean;
}

/** 0 exact character, 1 exact reading, 2 exact meaning, 3 partial. Empty query has no tier. */
export type MatchTier = 0 | 1 | 2 | 3;

export interface SearchHit {
  readonly entry: SearchableKanji;
  readonly tier: MatchTier | null;
  /** At least one of the kanji's cards is due (isDueCard) at the time of the search. */
  readonly due: boolean;
}

const UNLISTED = Number.MAX_SAFE_INTEGER;

/** Builds the in-memory index once per corpus. One entry per kanji (duplicates by id are dropped). */
export function buildSearchIndex(corpus: SearchCorpus): readonly SearchableKanji[] {
  const position = new Map(corpus.order.map((id, index) => [id, index]));
  const readingsByKanji = new Map<string, KanjiReading[]>();
  for (const reading of corpus.readings) {
    const bucket = readingsByKanji.get(reading.kanjiId);
    if (bucket === undefined) readingsByKanji.set(reading.kanjiId, [reading]);
    else bucket.push(reading);
  }
  const cardsByKanji = groupCardsByKanji(corpus.cards);

  const seen = new Set<string>();
  const entries: SearchableKanji[] = [];
  for (const kanji of corpus.kanji) {
    if (seen.has(kanji.id)) continue;
    seen.add(kanji.id);
    const readings = readingsByKanji.get(kanji.id) ?? [];
    const cards = cardsByKanji.get(kanji.id) ?? [];
    entries.push({
      kanji,
      readings,
      cards,
      review: evaluateKanjiReviewState(cards),
      position: position.get(kanji.id) ?? UNLISTED,
      character: toComparable(kanji.character),
      readingForms: readings.flatMap((r) => [toComparable(r.kana), toComparable(stripReadingMarks(r.kana)), ...(r.romaji === null ? [] : [toComparable(r.romaji)])]),
      meaningForms: [...kanji.meanings.en, ...kanji.meanings.th].map(toComparable),
    });
  }
  return entries.sort(compareEntries);
}

function compareEntries(a: SearchableKanji, b: SearchableKanji): number {
  return a.position - b.position || (a.kanji.id < b.kanji.id ? -1 : a.kanji.id > b.kanji.id ? 1 : 0);
}

function matchTier(entry: SearchableKanji, needle: string): MatchTier | null {
  if (entry.character === needle) return 0;
  if (entry.readingForms.includes(needle)) return 1;
  if (entry.meaningForms.includes(needle)) return 2;
  if (entry.character.includes(needle) || entry.readingForms.some((f) => f.includes(needle)) || entry.meaningForms.some((m) => m.includes(needle))) return 3;
  return null;
}

/**
 * Pure. Search AND state filter AND due filter. Order: match tier, then Project N5 order, then id; with an
 * empty query it is the Project N5 order. `nowMs` is the injected clock; each kanji appears once.
 */
export function searchKanji(index: readonly SearchableKanji[], query: SearchQuery, nowMs: number): readonly SearchHit[] {
  const needle = normalizeQuery(query.text);
  const hits: SearchHit[] = [];
  for (const entry of index) {
    const tier = needle === '' ? null : matchTier(entry, needle);
    if (needle !== '' && tier === null) continue;
    if (!matchesStateFilter(entry.review, query.state)) continue;
    const due = hasDueCard(entry.cards, nowMs);
    if (query.dueOnly && !due) continue;
    hits.push({ entry, tier, due });
  }
  return hits.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || compareEntries(a.entry, b.entry));
}
