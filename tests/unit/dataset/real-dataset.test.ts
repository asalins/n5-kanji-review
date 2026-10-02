import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkAgainstList } from '../../../scripts/dataset/validateAgainstList';
import { levelListSchema } from '../../../scripts/dataset/schemas';
import { createIndexedDbRepositories, type Repositories } from '../../../src/repositories/indexeddb';
import { kanjiDatasetFileSchema, thaiDatasetFileSchema } from '../../../src/services/content/datasetFiles';
import { checkIntegrity } from '../../../src/services/content/integrity';
import { loadDatasetContent } from '../../../src/services/content/loadDataset';
import { SINGLETON_KEY } from '../../../src/services/storage/schema';
import { makeKanjiId } from '../../../src/utils/kanjiId';
import { makeDataset, makeThai } from '../../helpers/datasetFixtures';
import { makeCard, makeLog, session, settings, streak } from '../../helpers/fixtures';
import { openTestDatabase } from '../../helpers/testDatabase';

/**
 * Tests on the REAL generated files (data/kanji/n5.json, n5.th.json). They need `npm run dataset:build`
 * to have been run once; the generated files are committed so a fresh checkout can run them.
 */
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const list = levelListSchema.parse(read('data/lists/n5-list.json'));
const rawDataset = read('data/kanji/n5.json');
const rawThai = read('data/kanji/n5.th.json');
const dataset = kanjiDatasetFileSchema.parse(rawDataset);
const thai = thaiDatasetFileSchema.parse(rawThai);
const byChar = (c: string) => dataset.kanji.find((k) => k.character === c);
const readingsOf = (c: string) => dataset.readings.filter((r) => r.kanjiId === makeKanjiId(c));

describe('real n5.json', () => {
  it('covers exactly the Project N5 list, in order', () => {
    expect(dataset.kanji.map((k) => k.character)).toEqual(list.kanji);
    expect(checkAgainstList(dataset, list)).toEqual({ notInList: [], listWithoutRecord: [] });
    expect(dataset.kanji.every((k) => k.level === 'N5')).toBe(true);
  });

  it('passes integrity checks and has the same version as the Thai file', () => {
    expect(checkIntegrity(dataset.kanji, dataset.readings)).toEqual([]);
    expect(thai.datasetVersion).toBe(dataset.datasetVersion);
    expect(dataset.sources.map((s) => s.name)).toEqual(['KANJIDIC2', 'Project Owner Provided N5 Kanji List']);
  });

  it('only contains Japanese readings; romaji is a non-empty string or an explicit null', () => {
    expect(
      dataset.readings.every(
        (r) => (r.type === 'on' || r.type === 'kun') && (r.romaji === null || r.romaji.length > 0),
      ),
    ).toBe(true);
  });

  it('matches values verified by hand against the real KANJIDIC2 file', () => {
    expect(byChar('水')).toMatchObject({ strokeCount: 4, frequency: 223, meanings: { en: ['water'] } });
    expect(byChar('一')).toMatchObject({ strokeCount: 1, frequency: 2 });
    expect(byChar('学')).toMatchObject({ strokeCount: 8, frequency: 63 });
    expect(byChar('何')).toMatchObject({ strokeCount: 7, frequency: 340 });
    expect(byChar('薬')).toMatchObject({ strokeCount: 16, frequency: 702 });
    expect(readingsOf('水').map((r) => [r.type, r.kana, r.romaji])).toEqual([
      ['on', 'スイ', 'sui'],
      ['kun', 'みず', 'mizu'],
      ['kun', 'みず-', 'mizu'],
    ]);
    expect(readingsOf('学').map((r) => r.kana)).toEqual(['ガク', 'まな.ぶ']);
  });

  it('keeps Thai separate and unfilled: no Thai text was invented', () => {
    expect(thai.entries).toHaveLength(196);
    expect(thai.entries.every((e) => e.meaningsTh.length === 0 && !e.reviewed && !e.ambiguous)).toBe(true);
  });
});

describe('real report: stroke count decision', () => {
  const report = read('data/kanji/n5.report.json') as { documentation: { strokeCount: string }; ambiguous: string[] };

  it('uses the primary KANJIDIC2 stroke count and documents the limitation', () => {
    expect(report.documentation.strokeCount).toContain('primary/default stroke count from KANJIDIC2');
    expect(report.documentation.strokeCount).toContain('not represented in the current Kanji entity model');
    const primary: Record<string, number> = { 週: 11, 近: 7, 遠: 13, 送: 9, 道: 12 };
    for (const [character, strokes] of Object.entries(primary)) {
      expect(byChar(character)?.strokeCount).toBe(strokes);
      expect(report.ambiguous).toContain(`${character}:strokeCount`);
    }
  });
});

describe('real dataset loaded through replaceContent', () => {
  let repos: Repositories;
  let dispose: () => Promise<void>;
  let dbHandle: Awaited<ReturnType<typeof openTestDatabase>>['db'];
  const deps = () => ({ writer: repos.contentWriter, reader: repos.kanji, now: () => 1_700_000_000_000 });

  beforeEach(async () => {
    const opened = await openTestDatabase();
    dispose = opened.dispose;
    dbHandle = opened.db;
    repos = createIndexedDbRepositories(opened.db);
  });
  afterEach(() => dispose());

  it('replaces old content with the real dataset: no stale records, versions agree everywhere', async () => {
    const old = makeDataset('n5-old', [['龍', '9F8D', 'dragon']]);
    await loadDatasetContent(deps(), old, makeThai('n5-old', ['kanji:U+9F8D']));
    expect(await repos.kanji.getById('kanji:U+9F8D')).not.toBeNull();

    const result = await loadDatasetContent(deps(), rawDataset, rawThai);
    expect(result).toEqual({ status: 'loaded', datasetVersion: dataset.datasetVersion, kanjiCount: 196 });

    expect(await repos.kanji.getById('kanji:U+9F8D')).toBeNull(); // stale record gone
    expect(await repos.kanji.getReadings('kanji:U+9F8D')).toEqual([]);
    expect(await repos.kanji.getByLevel('N5')).toHaveLength(196);
    expect(await dbHandle.count('kanji')).toBe(196);
    expect(await dbHandle.count('kanjiReadings')).toBe(dataset.readings.length);

    const meta = await dbHandle.get('contentMeta', SINGLETON_KEY);
    expect(meta?.datasetVersion).toBe(dataset.datasetVersion);
    expect(await repos.kanji.getDatasetVersion()).toBe(thai.datasetVersion);
    // Thai is merged from the separate file; nothing was invented, so th is empty
    expect((await repos.kanji.getById(makeKanjiId('水')))?.meanings).toEqual({ en: ['water'], th: [] });
  });

  it('does not touch user data when the real dataset replaces content', async () => {
    const card = makeCard();
    const log = makeLog();
    await repos.review.saveCard(card);
    await repos.review.appendLog(log);
    await repos.review.saveSession(session);
    await repos.review.saveStreakState(streak);
    await repos.settings.save(settings);

    await loadDatasetContent(deps(), makeDataset('n5-old', [['龍', '9F8D', 'dragon']]), makeThai('n5-old', []));
    await loadDatasetContent(deps(), rawDataset, rawThai);

    expect(await repos.review.getCard(card.id)).toEqual(card);
    expect(await repos.review.getLogs({ from: new Date(0), to: new Date(8.64e15) })).toEqual([log]);
    expect(await dbHandle.get('studySessions', session.id)).toEqual(session);
    expect(await repos.review.getStreakState()).toEqual(streak);
    expect(await repos.settings.get()).toEqual(settings);
  });

  it('is idempotent for the same version', async () => {
    await loadDatasetContent(deps(), rawDataset, rawThai);
    expect((await loadDatasetContent(deps(), rawDataset, rawThai)).status).toBe('up-to-date');
  });
});
