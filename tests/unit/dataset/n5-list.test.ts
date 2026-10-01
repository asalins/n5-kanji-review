import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { levelListSchema } from '../../../scripts/dataset/schemas';
import { PROJECT_N5_LIST, PROJECT_N5_LIST_TEXT } from '../../helpers/projectN5ListExpected';

const raw: unknown = JSON.parse(readFileSync('data/lists/n5-list.json', 'utf8'));
const parsed = levelListSchema.safeParse(raw);
const list = parsed.success ? parsed.data : null;
const isCjkIdeograph = (c: string) => {
  const cp = c.codePointAt(0) ?? 0;
  return cp >= 0x4e00 && cp <= 0x9fff;
};

describe('Project N5 Kanji List (data/lists/n5-list.json)', () => {
  it('matches the schema and carries project metadata', () => {
    expect(parsed.success).toBe(true);
    expect(list).toMatchObject({
      version: '1.0.0',
      level: 'N5',
      name: 'Project N5 Kanji List',
      sourceType: 'project-owner-provided',
    });
    expect(list?.sources).toHaveLength(1);
    expect(list?.sources[0]).toMatchObject({
      name: 'Project Owner Provided N5 Kanji List',
      type: 'user-provided-source',
    });
  });

  it('has exactly 196 kanji and the expectation itself is well-formed (1..196 in order)', () => {
    expect(PROJECT_N5_LIST).toHaveLength(196);
    const numbers = PROJECT_N5_LIST_TEXT.trim().split('\n').map((l) => Number(l.split(' ')[0]));
    expect(numbers).toEqual(Array.from({ length: 196 }, (_, i) => i + 1));
    expect(list?.kanji).toHaveLength(196);
  });

  it('has no duplicates, only single CJK ideographs', () => {
    const kanji = list?.kanji ?? [];
    expect(new Set(kanji).size).toBe(kanji.length);
    expect(kanji.every((c) => [...c].length === 1 && isCjkIdeograph(c))).toBe(true);
  });

  it('keeps the Project Owner order: position N holds exactly the provided kanji', () => {
    PROJECT_N5_LIST.forEach((expected, index) => {
      expect(list?.kanji[index], `position ${index + 1}`).toBe(expected);
    });
    expect(list?.kanji[0]).toBe('一');
    expect(list?.kanji[195]).toBe('薬');
  });

  it('has no missing and no extra characters', () => {
    const actual = new Set(list?.kanji);
    const expected = new Set(PROJECT_N5_LIST);
    expect([...expected].filter((c) => !actual.has(c))).toEqual([]);
    expect([...actual].filter((c) => !expected.has(c))).toEqual([]);
  });
});
