import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildFront, groupReadings, isCardPlayable, pickPromptReading, type KanjiCardData } from '../../../src/features/flashcards/presentation';
import type { KanjiReading } from '../../../src/types/entities';
import { openRealRepositories, realCard } from '../../helpers/realData';

const notation = (kana: string) => kana.includes('.') || kana.includes('-');
const reading = (type: 'on' | 'kun', kana: string): KanjiReading => ({ kanjiId: 'kanji:test', type, kana, romaji: null });

let all: KanjiCardData[] = [];
let dispose: () => Promise<void>;
beforeAll(async () => {
  const opened = await openRealRepositories();
  dispose = opened.dispose;
  const kanji = await opened.repos.kanji.getByLevel('N5');
  all = await Promise.all(kanji.map((k) => realCard(opened.repos, k.character)));
});
afterAll(() => dispose());

describe('Mode D prompt: a notation-free reading first, never an edited reading', () => {
  it('real dataset (196): whenever a reading without "." or "-" exists, one of those is the prompt', () => {
    expect(all).toHaveLength(196);
    for (const card of all) {
      const groups = groupReadings(card.readings);
      const prompt = pickPromptReading(groups);
      const clean = [...groups.kun, ...groups.on].some((v) => !notation(v.kana));
      if (clean) expect(notation(prompt!.kana), `${card.kanji.character}: ${prompt!.kana}`).toBe(false);
    }
  });

  it('the prompt is always one of the kanji\'s own source readings, character for character', () => {
    for (const card of all) {
      const prompt = pickPromptReading(groupReadings(card.readings))!;
      expect(card.readings.map((r) => r.kana), card.kanji.character).toContain(prompt.kana);
    }
  });

  it('every kanji can still be played in Mode D, and the front shows the chosen reading', () => {
    for (const card of all) expect(isCardPlayable('D', card), card.kanji.character).toBe(true);
    const sun = all.find((c) => c.kanji.character === '日')!;
    expect(JSON.stringify(buildFront('D', sun))).toContain('ひ');
  });

  it('regressions: 日 is not "-か", 一 is not "ひと-"', () => {
    const prompt = (c: string) => pickPromptReading(groupReadings(all.find((x) => x.kanji.character === c)!.readings))!.kana;
    expect(prompt('日')).toBe('ひ');
    expect(prompt('一')).toBe('イチ');
  });

  it('kun before on when both are clean; on when only on is clean', () => {
    expect(pickPromptReading(groupReadings([reading('kun', 'みず'), reading('on', 'スイ')]))!.kana).toBe('みず');
    expect(pickPromptReading(groupReadings([reading('kun', 'ひと.つ'), reading('on', 'イチ')]))!.kana).toBe('イチ');
  });

  it('notation-only kanji: the original reading is used exactly as written (no stripping)', () => {
    expect(pickPromptReading(groupReadings([reading('kun', 'ひと-'), reading('kun', 'ひと.つ')]))!.kana).toBe('ひと-');
    expect(pickPromptReading(groupReadings([reading('on', '-ジ')]))!.kana).toBe('-ジ');
    expect(pickPromptReading(groupReadings([]))).toBeNull();
  });
});
