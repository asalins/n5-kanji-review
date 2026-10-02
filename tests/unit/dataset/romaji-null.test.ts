import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildDataset } from '../../../scripts/dataset/buildDataset';
import { parseKanjidic2 } from '../../../scripts/dataset/kanjidic2';
import { createIndexedDbRepositories, type Repositories } from '../../../src/repositories/indexeddb';
import { kanjiDatasetFileSchema } from '../../../src/services/content/datasetFiles';
import { kanjiReadingSchema } from '../../../src/types/schemas';
import { makeKanjiId } from '../../../src/utils/kanjiId';
import { SYNTHETIC_SOURCE, makeList } from '../../helpers/datasetFixtures';
import { openTestDatabase } from '../../helpers/testDatabase';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('KanjiReading.romaji contract (string | null)', () => {
  const base = { kanjiId: 'kanji:U+6C34', type: 'on', kana: 'スイ' } as const;

  it('accepts a string romaji', () => {
    expect(kanjiReadingSchema.safeParse({ ...base, romaji: 'sui' }).success).toBe(true);
  });
  it('accepts null romaji (source kana present, romaji unresolved)', () => {
    expect(kanjiReadingSchema.safeParse({ ...base, kana: 'ジッ', romaji: null }).success).toBe(true);
  });
  it('rejects a missing romaji field and an empty-string placeholder', () => {
    expect(kanjiReadingSchema.safeParse({ ...base }).success).toBe(false);
    expect(kanjiReadingSchema.safeParse({ ...base, romaji: '' }).success).toBe(false);
  });
});

describe('build with final sokuon readings (synthetic XML in real KANJIDIC2 shape)', () => {
  const xml = `<kanjidic2><header><database_version>T</database_version></header>
<character><literal>十</literal><misc><stroke_count>2</stroke_count></misc><reading_meaning><rmgroup>
<reading r_type="ja_on">ジュウ</reading><reading r_type="ja_on">ジッ</reading><reading r_type="ja_on">ジュッ</reading>
<reading r_type="ja_kun">とお</reading><meaning>ten</meaning></rmgroup></reading_meaning></character>
<character><literal>早</literal><misc><stroke_count>6</stroke_count></misc><reading_meaning><rmgroup>
<reading r_type="ja_on">サッ</reading><meaning>early</meaning></rmgroup></reading_meaning></character></kanjidic2>`;
  const { dataset, report } = buildDataset({
    list: makeList(['十', '早']),
    kanjidic: parseKanjidic2(xml),
    kanjidicSource: SYNTHETIC_SOURCE,
    thai: null,
    datasetVersion: 'n5-test',
    generatedAt: '2026-10-01T00:00:00.000Z',
  });

  it('keeps the readings, stores romaji null, invents nothing, and stays valid', () => {
    expect(report.blockers).toEqual([]);
    expect(kanjiDatasetFileSchema.safeParse(dataset).success).toBe(true);
    const byKana = new Map(dataset?.readings.map((r) => [r.kana, r.romaji]));
    expect(byKana.get('ジッ')).toBeNull();
    expect(byKana.get('ジュッ')).toBeNull();
    expect(byKana.get('サッ')).toBeNull();
    expect(byKana.get('ジュウ')).toBe('juu');
    expect(dataset?.readings.map((r) => r.romaji)).not.toContain('jit');
  });

  it('reports the unresolved readings with kanji, kana, type and reason', () => {
    expect(report.unresolvedRomaji.map((u) => `${u.kanji}:${u.kana}:${u.type}`)).toEqual(['十:ジッ:on', '十:ジュッ:on', '早:サッ:on']);
    expect(report.unresolvedRomaji.every((u) => u.reason.includes('final small tsu'))).toBe(true);
    expect(report.ambiguous.some((a) => a.endsWith(':romaji'))).toBe(false);
  });
});

describe('real dataset: unresolved romaji', () => {
  const dataset = kanjiDatasetFileSchema.parse(read('data/kanji/n5.json'));
  const report = read('data/kanji/n5.report.json') as {
    unresolvedRomaji: Array<{ kanji: string; kana: string; type: string; reason: string }>;
    ambiguous: string[];
    blockers: string[];
  };
  const reading = (c: string, kana: string) =>
    dataset.readings.find((r) => r.kanjiId === makeKanjiId(c) && r.kana === kana);

  it.each([['十', 'ジッ'], ['十', 'ジュッ'], ['早', 'サッ']])('%s %s is kept with romaji null', (c, kana) => {
    expect(reading(c, kana)).toMatchObject({ kana, type: 'on', romaji: null });
  });

  it('contains no fabricated jit / jut / sat', () => {
    const romajis = dataset.readings.map((r) => r.romaji);
    for (const bad of ['jit', 'jut', 'sat']) expect(romajis).not.toContain(bad);
  });

  it('is complete: 196 kanji, 810 readings, and the 3 unresolved are reported', () => {
    expect(dataset.kanji).toHaveLength(196);
    expect(dataset.readings).toHaveLength(810);
    expect(dataset.readings.filter((r) => r.romaji === null)).toHaveLength(3);
    expect(report.unresolvedRomaji.map((u) => `${u.kanji}:${u.kana}`)).toEqual(['十:ジッ', '十:ジュッ', '早:サッ']);
    expect(report.unresolvedRomaji.every((u) => u.type === 'on' && u.reason.length > 0)).toBe(true);
    expect(report.blockers).toEqual([]);
  });

  it('keeps derivable romaji unchanged', () => {
    expect(reading('一', 'イチ')?.romaji).toBe('ichi');
    expect(reading('水', 'スイ')?.romaji).toBe('sui');
    expect(reading('学', 'ガク')?.romaji).toBe('gaku');
    expect(reading('水', 'みず')?.romaji).toBe('mizu');
  });
});

describe('repository with romaji null', () => {
  let repos: Repositories;
  let dispose: () => Promise<void>;
  beforeEach(async () => {
    const opened = await openTestDatabase();
    dispose = opened.dispose;
    repos = createIndexedDbRepositories(opened.db);
    await repos.contentWriter.saveContent({
      kanji: [{ id: 'kanji:ten', character: '十', level: 'N5', strokeCount: 2, frequency: null, meanings: { en: ['ten'], th: [] } }],
      readings: [
        { kanjiId: 'kanji:ten', type: 'on', kana: 'ジッ', romaji: null },
        { kanjiId: 'kanji:ten', type: 'on', kana: 'ジュウ', romaji: 'juu' },
      ],
      vocabulary: [],
      examples: [],
    });
  });
  afterEach(() => dispose());

  it('saves and reads back a reading whose romaji is null', async () => {
    const readings = await repos.kanji.getReadings('kanji:ten');
    expect(readings.find((r) => r.kana === 'ジッ')).toEqual({ kanjiId: 'kanji:ten', type: 'on', kana: 'ジッ', romaji: null });
    expect(readings).toHaveLength(2);
  });

  it('search does not crash and still finds the kanji by kana, romaji and character', async () => {
    expect((await repos.kanji.search('ジッ')).map((k) => k.id)).toEqual(['kanji:ten']);
    expect((await repos.kanji.search('juu')).map((k) => k.id)).toEqual(['kanji:ten']);
    expect((await repos.kanji.search('十')).map((k) => k.id)).toEqual(['kanji:ten']);
    expect(await repos.kanji.search('jit')).toEqual([]);
  });
});
