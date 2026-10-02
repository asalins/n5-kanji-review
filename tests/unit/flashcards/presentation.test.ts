import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_DISPLAYED_MEANINGS,
  buildFront,
  groupReadings,
  isCardPlayable,
  pickPromptReading,
  promptMeanings,
  selectMeanings,
  type KanjiCardData,
} from '../../../src/features/flashcards/presentation';
import type { Kanji, KanjiReading } from '../../../src/types/entities';
import { openRealRepositories, realCard } from '../../helpers/realData';

let cards: Record<string, KanjiCardData>;
let dispose: () => Promise<void>;

beforeAll(async () => {
  const opened = await openRealRepositories();
  dispose = opened.dispose;
  cards = {};
  for (const c of ['一', '水', '学', '何', '薬', '十']) cards[c] = await realCard(opened.repos, c);
});
afterAll(() => dispose());

const kanji = (en: string[], th: string[] = []): Kanji => ({
  id: 'kanji:test', character: '試', level: 'N5', strokeCount: 1, frequency: null, meanings: { en, th },
});
const reading = (type: 'on' | 'kun', kana: string, romaji: string | null): KanjiReading => ({ kanjiId: 'kanji:test', type, kana, romaji });

describe('meaning presentation policy', () => {
  it('caps the list, keeps source order, trims and removes exact duplicates, without mutating the source', () => {
    const source = kanji([' one ', 'one', 'two', 'three', 'four']);
    const before = JSON.stringify(source);
    expect(selectMeanings(source).en).toEqual(['one', 'two', 'three']);
    expect(selectMeanings(source).en).toHaveLength(MAX_DISPLAYED_MEANINGS);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('is deterministic', () => {
    const k = kanji(['a', 'b', 'c', 'd']);
    expect(selectMeanings(k)).toEqual(selectMeanings(k));
  });
  it('prefers Thai for the Mode B prompt when it exists, otherwise English', () => {
    expect(promptMeanings(selectMeanings(kanji(['water'], ['น้ำ'])))).toEqual(['น้ำ']);
    expect(promptMeanings(selectMeanings(kanji(['water'])))).toEqual(['water']);
  });
  it('real data: 一 has several English meanings and no Thai yet', () => {
    const m = selectMeanings(cards['一']!.kanji);
    expect(m.en.length).toBeGreaterThan(0);
    expect(m.en.length).toBeLessThanOrEqual(MAX_DISPLAYED_MEANINGS);
    expect(m.th).toEqual([]);
  });
});

describe('reading presentation', () => {
  it('groups on/kun, keeps kana exactly, lists plain readings before marked ones', () => {
    const groups = groupReadings([
      reading('kun', 'ひと-', 'hito'),
      reading('kun', 'ひと.つ', 'hitotsu'),
      reading('kun', 'ひと', 'hito'),
      reading('on', 'イチ', 'ichi'),
    ]);
    expect(groups.kun.map((r) => r.kana)).toEqual(['ひと', 'ひと-', 'ひと.つ']);
    expect(groups.on.map((r) => r.kana)).toEqual(['イチ']);
  });
  it('keeps readings whose romaji is null, as null (never a string)', () => {
    const groups = groupReadings([reading('on', 'ジッ', null), reading('on', 'ジュウ', 'juu')]);
    expect(groups.on).toContainEqual({ kana: 'ジッ', romaji: null });
  });
  it('real data: 十 keeps ジッ and ジュッ with romaji null', () => {
    const on = groupReadings(cards['十']!.readings).on;
    expect(on.find((r) => r.kana === 'ジッ')?.romaji).toBeNull();
    expect(on.find((r) => r.kana === 'ジュッ')?.romaji).toBeNull();
    expect(on.find((r) => r.kana === 'ジュウ')?.romaji).toBe('juu');
  });
  it('real data: 水 has スイ and みず', () => {
    const g = groupReadings(cards['水']!.readings);
    expect(g.on.map((r) => r.kana)).toEqual(['スイ']);
    expect(g.kun.map((r) => r.kana)).toContain('みず');
  });
  it('picks a kun reading for Mode D, falling back to on', () => {
    expect(pickPromptReading(groupReadings(cards['水']!.readings))?.kana).toBe('みず');
    expect(pickPromptReading(groupReadings([reading('on', 'サン', 'san')]))?.kana).toBe('サン');
    expect(pickPromptReading(groupReadings([]))).toBeNull();
  });
});

describe('the four study modes (front never shows the answer)', () => {
  it('A: Kanji → Meaning shows the kanji', () => {
    expect(buildFront('A', cards['水']!)).toEqual({ kind: 'kanji', text: '水' });
  });
  it('B: Meaning → Kanji shows meaning lines and not the kanji', () => {
    const front = buildFront('B', cards['水']!);
    expect(front).toMatchObject({ kind: 'meaning', lines: ['water'] });
    expect(JSON.stringify(front)).not.toContain('水');
  });
  it('C: Kanji → Reading shows the kanji', () => {
    expect(buildFront('C', cards['学']!)).toEqual({ kind: 'kanji', text: '学' });
  });
  it('D: Reading → Kanji shows a reading and not the kanji', () => {
    const front = buildFront('D', cards['水']!);
    expect(front).toEqual({ kind: 'reading', kana: 'みず' });
    expect(JSON.stringify(front)).not.toContain('水');
  });
  it('every real example is playable in every mode', () => {
    for (const c of Object.values(cards)) for (const mode of ['A', 'B', 'C', 'D'] as const) expect(isCardPlayable(mode, c)).toBe(true);
  });
  it('a card without readings or meanings is not playable where it is needed', () => {
    const bare: KanjiCardData = { kanji: kanji([]), readings: [] };
    expect(isCardPlayable('A', bare)).toBe(false);
    expect(isCardPlayable('C', bare)).toBe(false);
    expect(isCardPlayable('D', bare)).toBe(false);
  });
});
