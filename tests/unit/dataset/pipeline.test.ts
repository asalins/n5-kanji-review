import { describe, expect, it } from 'vitest';
import { buildDataset } from '../../../scripts/dataset/buildDataset';
import { parseKanjidic2 } from '../../../scripts/dataset/kanjidic2';
import { kanaToRomaji } from '../../../scripts/dataset/romaji';
import { checkAgainstList } from '../../../scripts/dataset/validateAgainstList';
import { buildContentBundle } from '../../../src/services/content/buildContentBundle';
import { kanjiDatasetFileSchema } from '../../../src/services/content/datasetFiles';
import { checkIntegrity } from '../../../src/services/content/integrity';
import { makeKanjiId } from '../../../src/utils/kanjiId';
import { SYNTHETIC_SOURCE, makeDataset, makeList, makeThai, syntheticKanjidicXml } from '../../helpers/datasetFixtures';

const kanjidic = parseKanjidic2(syntheticKanjidicXml);
const run = (list: ReturnType<typeof makeList>, thai = null as ReturnType<typeof makeThai> | null) =>
  buildDataset({
    list,
    kanjidic,
    kanjidicSource: SYNTHETIC_SOURCE,
    thai,
    datasetVersion: 'n5-test',
    generatedAt: '2026-10-01T00:00:00.000Z',
  });

describe('romaji', () => {
  it('converts with Hepburn rules and refuses what it cannot convert', () => {
    expect(kanaToRomaji('スイ')).toBe('sui');
    expect(kanaToRomaji('みず.-')).toBe('mizu');
    expect(kanaToRomaji('ニチ')).toBe('nichi');
    expect(kanaToRomaji('ショウ')).toBe('shou');
    expect(kanaToRomaji('ジツ')).toBe('jitsu');
    // final small tsu: the doubled consonant is unknown without context, so nothing is derived
    expect(kanaToRomaji('ジッ')).toBeNull();
    expect(kanaToRomaji('ジュッ')).toBeNull();
    expect(kanaToRomaji('サッ')).toBeNull();
    expect(kanaToRomaji('はっぴ')).toBe('happi');
    expect(kanaToRomaji('いっち')).toBe('itchi');
    expect(kanaToRomaji('きょ')).toBe('kyo');
    expect(kanaToRomaji('ABC')).toBeNull();
    expect(kanaToRomaji('')).toBeNull();
  });
});

describe('KANJIDIC2 parsing', () => {
  it('reads header, readings, English-only meanings, frequency and all stroke counts', () => {
    expect(kanjidic.header).toEqual({ fileVersion: '4', databaseVersion: 'TEST-1', dateOfCreation: '2000-01-01' });
    const water = kanjidic.characters.find((c) => c.literal === '水');
    expect(water?.onReadings).toEqual(['スイ']);
    expect(water?.kunReadings).toEqual(['みず', 'みず-']);
    expect(water?.meaningsEn).toEqual(['water']);
    expect(water?.frequency).toBe(300);
    expect(kanjidic.characters.find((c) => c.literal === '火')?.strokeCounts).toEqual([4, 5]);
  });
});

describe('buildDataset', () => {
  it('builds a valid dataset, in project-list scope only, with versioned metadata', () => {
    const { dataset, report } = run(makeList(['水', '山']));
    expect(report.blockers).toEqual([]);
    expect(dataset?.kanji.map((k) => k.character)).toEqual(['水', '山']);
    expect(dataset?.kanji[0]?.id).toBe(makeKanjiId('水'));
    expect(dataset?.datasetVersion).toBe('n5-test');
    expect(dataset?.sources.map((s) => s.name)).toContain('Synthetic test source');
    expect(report).toMatchObject({ total: 2, valid: 2, missing: [], duplicate: [] });
  });

  it('reports (does not fix) kanji missing from the source', () => {
    const { dataset, report } = run(makeList(['水', '龍']));
    expect(report.missing).toEqual(['龍']);
    expect(dataset).toBeNull();
    expect(report.valid).toBe(0);
  });

  it('reports missing reading and missing stroke count', () => {
    const { report } = run(makeList(['口', '目']));
    expect(report.missingReading).toEqual(['口']);
    expect(report.missingStrokeCount).toEqual(['目']);
    expect(report.blockers.length).toBeGreaterThan(0);
  });

  it('reports a stroke-count conflict as ambiguous, not silently resolved', () => {
    const { report } = run(makeList(['火']));
    expect(report.ambiguous).toContain('火:strokeCount');
    expect(report.documentation.strokeCount).toContain('primary/default stroke count');
  });

  it('detects duplicates in the list', () => {
    const { report } = run(makeList(['水', '水']));
    expect(report.duplicate).toEqual(['list:水']);
  });

  it('refuses an empty list or a list without a source (N5 LIST SOURCE REQUIRED)', () => {
    expect(run(makeList([])).report.blockers.join()).toContain('N5 LIST SOURCE REQUIRED');
    expect(run(makeList(['水'], { sources: [] })).report.blockers.join()).toContain('N5 LIST SOURCE REQUIRED');
  });

  it('counts missing Thai as a warning, not a blocker', () => {
    const { dataset, report } = run(makeList(['水', '山']), makeThai('n5-test', [makeKanjiId('水')]));
    expect(report.missingThai).toEqual([makeKanjiId('山')]);
    expect(report.blockers).toEqual([]);
    expect(dataset).not.toBeNull();
  });

  it('reports unknown Thai entries and a Thai version mismatch as blockers', () => {
    const unknown = run(makeList(['水']), makeThai('n5-test', ['kanji:U+9999']));
    expect(unknown.report.unknownThai).toEqual(['kanji:U+9999']);
    expect(unknown.dataset).toBeNull();
    expect(run(makeList(['水']), makeThai('other-version', [])).dataset).toBeNull();
  });
});

describe('dataset validation', () => {
  const good = makeDataset('n5-test', [['水', '6C34', 'water']]);

  it('accepts a valid dataset file', () => {
    expect(kanjiDatasetFileSchema.safeParse(good).success).toBe(true);
  });
  it('rejects an invalid level and an invalid reading type', () => {
    expect(kanjiDatasetFileSchema.safeParse({ ...good, level: 'N9' }).success).toBe(false);
    const badReading = { ...good, readings: [{ ...good.readings[0], type: 'both' }] };
    expect(kanjiDatasetFileSchema.safeParse(badReading).success).toBe(false);
  });
  it('rejects missing required structure', () => {
    expect(kanjiDatasetFileSchema.safeParse({ ...good, datasetVersion: '' }).success).toBe(false);
    expect(kanjiDatasetFileSchema.safeParse({ ...good, sources: [] }).success).toBe(false);
  });

  it('detects duplicate id, duplicate character, duplicate reading and orphan readings', () => {
    const k = good.kanji[0]!;
    const r = good.readings[0]!;
    const codes = (issues: ReturnType<typeof checkIntegrity>) => issues.map((i) => i.code);
    expect(codes(checkIntegrity([k, k], [r]))).toContain('DUPLICATE_ID');
    expect(codes(checkIntegrity([k, { ...k, id: 'kanji:U+0001' }], [r]))).toContain('DUPLICATE_CHARACTER');
    expect(codes(checkIntegrity([k], [r, r]))).toContain('DUPLICATE_READING');
    expect(codes(checkIntegrity([k], [r, { ...r, kanjiId: 'kanji:U+FFFF' }]))).toContain('ORPHAN_READING');
    expect(codes(checkIntegrity([k], []))).toContain('KANJI_WITHOUT_READING');
    expect(codes(checkIntegrity([{ ...k, id: 'kanji:U+0002' }], [{ ...r, kanjiId: 'kanji:U+0002' }]))).toContain('ID_CHARACTER_MISMATCH');
  });

  it('checks the dataset against the project list in both directions', () => {
    const check = checkAgainstList(good, makeList(['火']));
    expect(check.notInList).toEqual(['水']);
    expect(check.listWithoutRecord).toEqual(['火']);
  });
});

describe('Thai merge', () => {
  it('keeps Thai separate, withholds ambiguous meanings and reports gaps', () => {
    const dataset = makeDataset('v', [['水', '6C34', 'water'], ['火', '706B', 'fire'], ['山', '5C71', 'mountain']]);
    const thai = {
      datasetVersion: 'v',
      entries: [
        { kanjiId: 'kanji:U+6C34', meaningsTh: ['น้ำ'], reviewed: true, ambiguous: false },
        { kanjiId: 'kanji:U+706B', meaningsTh: ['ไฟ'], reviewed: false, ambiguous: true },
      ],
    };
    const { bundle, thai: report } = buildContentBundle(dataset, thai);
    expect(bundle.kanji.map((k) => k.meanings.th)).toEqual([['น้ำ'], [], []]);
    expect(report.ambiguousThai).toEqual(['kanji:U+706B']);
    expect(report.missingThai).toEqual(['kanji:U+706B', 'kanji:U+5C71']);
  });
});
