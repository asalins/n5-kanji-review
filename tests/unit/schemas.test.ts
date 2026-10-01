import { describe, expect, it } from 'vitest';
import { kanjiSchema, reviewCardSchema, studySessionSchema } from '../../src/types/schemas';
import { contentBundle, makeCard, session } from '../helpers/fixtures';

describe('schemas', () => {
  it('accepts valid records', () => {
    expect(kanjiSchema.safeParse(contentBundle.kanji[0]).success).toBe(true);
    expect(reviewCardSchema.safeParse(makeCard()).success).toBe(true);
    expect(studySessionSchema.safeParse(session).success).toBe(true);
  });

  it('rejects multi-character kanji, bad levels, non-integer stroke counts and empty ids', () => {
    const base = contentBundle.kanji[0];
    expect(kanjiSchema.safeParse({ ...base, character: '水火' }).success).toBe(false);
    expect(kanjiSchema.safeParse({ ...base, level: 'N6' }).success).toBe(false);
    expect(kanjiSchema.safeParse({ ...base, strokeCount: 3.5 }).success).toBe(false);
    expect(kanjiSchema.safeParse({ ...base, strokeCount: 0 }).success).toBe(false);
    expect(kanjiSchema.safeParse({ ...base, id: '' }).success).toBe(false);
  });

  it('rejects malformed timestamps and missing algorithmVersion on cards', () => {
    expect(reviewCardSchema.safeParse({ ...makeCard(), due: 1.5 }).success).toBe(false);
    expect(reviewCardSchema.safeParse({ ...makeCard(), due: -1 }).success).toBe(false);
    expect(reviewCardSchema.safeParse({ ...makeCard(), due: '2026-01-01' }).success).toBe(false);
    const { algorithmVersion: _omitted, ...withoutVersion } = makeCard();
    expect(reviewCardSchema.safeParse(withoutVersion).success).toBe(false);
  });
});
