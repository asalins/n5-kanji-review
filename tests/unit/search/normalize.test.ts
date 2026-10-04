import { describe, expect, it } from 'vitest';
import { foldKana, normalizeQuery, stripReadingMarks, toComparable } from '../../../src/services/kanjiSearch/normalize';

describe('search normalization (comparison only; stored data is never changed)', () => {
  it('folds katakana to hiragana', () => {
    expect(foldKana('スイ')).toBe('すい');
    expect(foldKana('ジュッ')).toBe('じゅっ');
    expect(foldKana('みず')).toBe('みず');
  });
  it('leaves kanji, Latin and the prolonged-sound mark alone', () => {
    expect(foldKana('水abc')).toBe('水abc');
    expect(foldKana('ラーメン')).toBe('らーめん');
  });
  it('strips the KANJIDIC2 marks "." and "-"', () => {
    expect(stripReadingMarks('ひと.つ')).toBe('ひとつ');
    expect(stripReadingMarks('-ず')).toBe('ず');
    expect(stripReadingMarks('みず-')).toBe('みず');
  });
  it('lower-cases Latin only (kana and kanji are not case-changed)', () => {
    expect(toComparable('MIZU')).toBe('mizu');
    expect(toComparable('Mizu')).toBe('mizu');
    expect(toComparable('水')).toBe('水');
  });
  it('trims the query', () => expect(normalizeQuery('  Water ')).toBe('water'));
  it('is pure: the same input gives the same output', () => {
    expect(toComparable('スイ')).toBe(toComparable('スイ'));
  });
});
