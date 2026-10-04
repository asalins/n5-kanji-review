import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchKanji, type SearchCorpus, type SearchQuery } from '../../../src/services/kanjiSearch/searchKanji';
import type { LearningState } from '../../../src/types/entities';
import { makeKanjiId } from '../../../src/utils/kanjiId';
import { NOON, storedCard } from '../../helpers/sessionFixtures';
import { DAY, ONE, ORDER, READINGS, STUDY, TEN, WATER, corpus, k, r } from '../../helpers/searchFixtures';

const find = (c: SearchCorpus, text: string, over: Partial<SearchQuery> = {}, now = NOON) =>
  searchKanji(buildSearchIndex(c), { text, state: 'ALL', dueOnly: false, ...over }, now).map((h) => h.entry.kanji.character);
const q = (text: string, over: Partial<SearchQuery> = {}) => find(corpus(), text, over);

describe('search: kanji, meaning, Thai, kana, romaji', () => {
  it('exact kanji', () => expect(q('水')).toEqual(['水']));
  it('partial kanji (one character: the same)', () => expect(q('学')).toEqual(['学']));
  it('exact English meaning', () => expect(q('water')).toEqual(['水']));
  it('partial English meaning', () => expect(q('wat')).toEqual(['水']));
  it('a non-first meaning is searched too (not only the displayed ones)', () => expect(q('science')).toEqual(['学']));
  it('Thai meaning (exact and partial)', () => {
    expect(q('น้ำ')).toEqual(['水']);
    expect(q('โรง')).toEqual(['学']);
    expect(q('พระอาทิตย์')).toEqual(['日']);
  });
  it('exact and partial kana', () => {
    expect(q('みず')).toEqual(['水']);
    expect(q('がく')).toEqual(['学']);
    expect(q('にち')).toEqual(['日']);
    expect(q('みず')).toEqual(['水']);
    expect(q('ま')).toEqual(['学']);
  });
  it('exact and partial romaji', () => {
    expect(q('mizu')).toEqual(['水']);
    expect(q('gaku')).toEqual(['学']);
    expect(q('nichi')).toEqual(['日']);
    expect(q('miz')).toEqual(['水']);
  });
  it('English and romaji are case-insensitive and give the same result', () => {
    expect(q('MIZU')).toEqual(q('mizu'));
    expect(q('Mizu')).toEqual(q('mizu'));
    expect(q('WATER')).toEqual(q('water'));
  });
  it('katakana readings are found by hiragana and the reverse (comparison fold only)', () => {
    expect(q('すい')).toEqual(['水']);
    expect(q('スイ')).toEqual(['水']);
    expect(q('ミズ')).toEqual(['水']);
    expect(q('にち')).toEqual(q('ニチ'));
  });
  it('notation marks do not block matching: ひとつ finds ひと.つ, and ず-less forms work', () => {
    expect(q('ひとつ')).toEqual(['一']);
    expect(q('まなぶ')).toEqual(['学']);
    expect(q('び')).toContain('日');
  });
  it('the stored reading is untouched and still shown exactly as stored', () => {
    const hit = searchKanji(buildSearchIndex(corpus()), { text: 'ひとつ', state: 'ALL', dueOnly: false }, NOON)[0]!;
    expect(hit.entry.readings.map((x) => x.kana)).toContain('ひと.つ');
    expect(hit.entry.readings.map((x) => x.kana)).toContain('イチ');
  });
  it('a reading with romaji null is still found by its kana and never by "null"', () => {
    expect(q('ジッ')).toEqual(['十']);
    expect(q('じっ')).toEqual(['十']);
    expect(q('null')).toEqual([]);
  });
});

describe('search: empty query, no result', () => {
  it('empty and blank queries list every kanji in Project N5 order', () => {
    expect(q('')).toEqual(['一', '十', '日', '水', '学']);
    expect(q('   ')).toEqual(q(''));
  });
  it('no match gives an empty list (not an error)', () => expect(q('zzzzqq')).toEqual([]));
});

describe('results: one hit per kanji, ranked, deterministic', () => {
  it('a kanji matching on several fields appears once', () => {
    const hits = searchKanji(buildSearchIndex(corpus()), { text: 'ひ', state: 'ALL', dueOnly: false }, NOON);
    const chars = hits.map((h) => h.entry.kanji.character);
    expect(new Set(chars).size).toBe(chars.length);
  });
  it('duplicate kanji in the corpus are collapsed', () => {
    expect(find(corpus({ kanji: [WATER, WATER, DAY] }), '')).toEqual(['日', '水']);
  });
  it('tier order: exact kanji, then exact reading, then exact meaning, then partial', () => {
    const c: SearchCorpus = {
      kanji: [k('甲', ['alpha']), k('乙', ['beta alpha']), k('丙', ['alpha']), k('丁', ['alphabet'])],
      readings: [r('甲', 'on', 'コウ', 'kou'), r('乙', 'on', 'オツ', 'alpha'), r('丙', 'on', 'ヘイ', 'hei'), r('丁', 'on', 'テイ', 'tei')],
      cards: [],
      order: ['丁', '丙', '乙', '甲'].map(makeKanjiId),
    };
    // 乙: exact reading (romaji "alpha"); 甲 and 丙: exact meaning; 丁 and 乙's meaning: partial. 乙 wins by reading.
    expect(find(c, 'alpha')).toEqual(['乙', '丙', '甲', '丁']);
  });
  it('exact kanji beats exact reading beats exact meaning for the same query', () => {
    const c: SearchCorpus = {
      kanji: [k('甲', ['x']), k('乙', ['甲']), k('丙', ['y'])],
      readings: [r('甲', 'on', 'コウ', 'kou'), r('乙', 'on', 'オツ', 'otsu'), r('丙', 'on', 'ヘイ', 'hei')],
      cards: [],
      order: ['丙', '乙', '甲'].map(makeKanjiId),
    };
    expect(find(c, '甲')).toEqual(['甲', '乙']);
  });
  it('within a tier, the Project N5 order decides, then the id; unlisted kanji come last', () => {
    const c = corpus({ kanji: [WATER, DAY, STUDY, ONE, TEN, k('月', ['moon sun'])], order: ORDER });
    expect(find(c, 'sun')).toEqual(['日', '月']); // 日 exact meaning (tier 2) before 月 partial; 月 is not in the list
    expect(find(c, 'i')).toEqual(['一', '十', '日', '水', '学', '月'].filter((ch) => find(c, 'i').includes(ch)));
  });
  it('is deterministic: same input, same output, whatever the input order', () => {
    const base = find(corpus(), 'i');
    for (let i = 0; i < 5; i += 1) expect(find(corpus(), 'i')).toEqual(base);
    expect(find(corpus({ kanji: [...corpus().kanji].reverse(), readings: [...READINGS].reverse() }), 'i')).toEqual(base);
  });
});

describe('filters and their combination (AND)', () => {
  const T = NOON;
  const c = (state: LearningState, chars: string[], over: { due?: number } = {}) =>
    chars.flatMap((ch) => (['A', 'B', 'C', 'D'] as const).map((m) => storedCard(ch, m, { state, due: over.due ?? T + 1_000, reviewCount: state === 'NEW' ? 0 : 2 })));
  const cards = [
    ...c('MASTERED', ['水']), // Mastered Kanji
    ...c('REVIEW', ['学'], { due: T - 1 }), // Review + due
    ...c('LEARNING', ['日']), // Learning, not due
    ...c('NEW', ['十'], { due: T - 5 }), // NEW with a past due value: not due
    storedCard('一', 'A', { state: 'RELEARNING', reviewCount: 3, due: T + 5_000 }),
  ];
  const withCards = corpus({ cards });
  const f = (text: string, over: Partial<SearchQuery>) => find(withCards, text, over, T);

  it('All shows everything; each state filter shows the right kanji', () => {
    expect(f('', {})).toEqual(['一', '十', '日', '水', '学']);
    expect(f('', { state: 'NEW' })).toEqual(['十']);
    expect(f('', { state: 'LEARNING' })).toEqual(['日']);
    expect(f('', { state: 'REVIEW' })).toEqual(['学']);
    expect(f('', { state: 'RELEARNING' })).toEqual(['一']);
    expect(f('', { state: 'MASTERED' })).toEqual(['水']);
  });
  it('Due now: only a card that passes isDueCard counts (NEW + past due is not due)', () => {
    expect(f('', { dueOnly: true })).toEqual(['学']);
  });
  it('one due card among the four modes makes the kanji due; all in the future makes it not due', () => {
    const one = corpus({ cards: [...c('REVIEW', ['水']).map((x, i) => ({ ...x, due: i === 1 ? T : T + 9_999 }))] });
    expect(find(one, '', { dueOnly: true }, T)).toEqual(['水']);
    const none = corpus({ cards: c('REVIEW', ['水']) });
    expect(find(none, '', { dueOnly: true }, T)).toEqual([]);
  });
  it('Search + State', () => {
    expect(f('water', { state: 'MASTERED' })).toEqual(['水']);
    expect(f('water', { state: 'LEARNING' })).toEqual([]);
    expect(f('study', { state: 'REVIEW' })).toEqual(['学']);
  });
  it('Search + Due', () => {
    expect(f('gaku', { dueOnly: true })).toEqual(['学']);
    expect(f('mizu', { dueOnly: true })).toEqual([]);
  });
  it('State + Due', () => {
    expect(f('', { state: 'REVIEW', dueOnly: true })).toEqual(['学']);
    expect(f('', { state: 'LEARNING', dueOnly: true })).toEqual([]);
  });
  it('Search + State + Due (all must hold)', () => {
    expect(f('学', { state: 'REVIEW', dueOnly: true })).toEqual(['学']);
    expect(f('学', { state: 'MASTERED', dueOnly: true })).toEqual([]);
    expect(f('mizu', { state: 'MASTERED', dueOnly: true })).toEqual([]);
  });
  it('MASTERED + due <= now is due; the clock decides', () => {
    const m = corpus({ cards: c('MASTERED', ['水'], { due: T }) });
    expect(find(m, '', { dueOnly: true }, T)).toEqual(['水']);
    expect(find(m, '', { dueOnly: true }, T - 1)).toEqual([]);
  });
  it('a kanji with no card, or with a single card, is handled', () => {
    expect(find(corpus(), '', { state: 'NEW' })).toHaveLength(5);
    const single = corpus({ cards: [storedCard('水', 'A', { state: 'REVIEW', reviewCount: 1 })] });
    expect(find(single, '', { state: 'MASTERED' })).toEqual([]);
    expect(find(single, '', { state: 'REVIEW' })).toEqual(['水']);
  });
  it('the due flag on a hit matches the filter', () => {
    const hits = searchKanji(buildSearchIndex(withCards), { text: '', state: 'ALL', dueOnly: false }, T);
    expect(hits.filter((h) => h.due).map((h) => h.entry.kanji.character)).toEqual(['学']);
  });
});
