import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepositories, type Repositories } from '../../../src/repositories/indexeddb';
import { loadDatasetContent } from '../../../src/services/content/loadDataset';
import { ValidationError } from '../../../src/utils/errors';
import { makeKanjiId } from '../../../src/utils/kanjiId';
import { makeCard, makeLog, session, settings, streak } from '../../helpers/fixtures';
import { makeDataset, makeThai } from '../../helpers/datasetFixtures';
import { openTestDatabase } from '../../helpers/testDatabase';

let repos: Repositories;
let dispose: () => Promise<void>;
const NOW = 1_700_000_000_000;
const deps = () => ({ writer: repos.contentWriter, reader: repos.kanji, now: () => NOW });

const V1 = makeDataset('n5-v1', [['水', '6C34', 'water'], ['火', '706B', 'fire']]);
const V2 = makeDataset('n5-v2', [['水', '6C34', 'water'], ['山', '5C71', 'mountain']]);
const thaiFor = (d: typeof V1) => makeThai(d.datasetVersion, d.kanji.map((k) => k.id));

beforeEach(async () => {
  const opened = await openTestDatabase();
  dispose = opened.dispose;
  repos = createIndexedDbRepositories(opened.db);
});
afterEach(() => dispose());

describe('dataset replacement', () => {
  it('reports no dataset before the first load, then the loaded version', async () => {
    expect(await repos.kanji.getDatasetVersion()).toBeNull();
    const result = await loadDatasetContent(deps(), V1, thaiFor(V1));
    expect(result).toEqual({ status: 'loaded', datasetVersion: 'n5-v1', kanjiCount: 2 });
    expect(await repos.kanji.getDatasetVersion()).toBe('n5-v1');
    expect((await repos.kanji.getById(makeKanjiId('水')))?.meanings).toEqual({ en: ['water'], th: ['ทดสอบ'] });
  });

  it('leaves no stale content when a new dataset replaces an old one', async () => {
    await loadDatasetContent(deps(), V1, thaiFor(V1));
    const fireId = makeKanjiId('火');
    expect(await repos.kanji.getReadings(fireId)).toHaveLength(1);

    const result = await loadDatasetContent(deps(), V2, thaiFor(V2));
    expect(result.status).toBe('loaded');
    expect(await repos.kanji.getById(fireId)).toBeNull();
    expect(await repos.kanji.getReadings(fireId)).toEqual([]);
    expect((await repos.kanji.getByLevel('N5')).map((k) => k.character).sort()).toEqual(['山', '水'].sort());
    expect(await repos.kanji.getDatasetVersion()).toBe('n5-v2');
  });

  it('does nothing when the same version is already loaded', async () => {
    await loadDatasetContent(deps(), V1, thaiFor(V1));
    expect((await loadDatasetContent(deps(), V1, thaiFor(V1))).status).toBe('up-to-date');
  });

  it('never touches user data (cards, logs, sessions, settings, streak)', async () => {
    const card = makeCard();
    const log = makeLog();
    await repos.review.saveCard(card);
    await repos.review.appendLog(log);
    await repos.review.saveSession(session);
    await repos.review.saveStreakState(streak);
    await repos.settings.save(settings);

    await loadDatasetContent(deps(), V1, thaiFor(V1));
    await loadDatasetContent(deps(), V2, thaiFor(V2));

    expect(await repos.review.getCard(card.id)).toEqual(card);
    expect(await repos.review.getLogs({ from: new Date(0), to: new Date(8.64e15) })).toEqual([log]);
    expect(await repos.review.getStreakState()).toEqual(streak);
    expect(await repos.settings.get()).toEqual(settings);
  });

  it('keeps the old content when the new dataset is invalid', async () => {
    await loadDatasetContent(deps(), V1, thaiFor(V1));
    const broken = { ...V2, readings: [] }; // kanji without readings fails integrity
    await expect(loadDatasetContent(deps(), broken, thaiFor(V2))).rejects.toBeInstanceOf(ValidationError);
    await expect(repos.contentWriter.replaceContent({ kanji: [{ id: '' } as never], readings: [], vocabulary: [], examples: [] }, { datasetVersion: 'x', loadedAt: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect(await repos.kanji.getDatasetVersion()).toBe('n5-v1');
    expect(await repos.kanji.getByLevel('N5')).toHaveLength(2);
  });

  it('rejects mismatched dataset/Thai versions and malformed files', async () => {
    await expect(loadDatasetContent(deps(), V1, makeThai('n5-other', []))).rejects.toBeInstanceOf(ValidationError);
    await expect(loadDatasetContent(deps(), { nope: true }, thaiFor(V1))).rejects.toBeInstanceOf(ValidationError);
    expect(await repos.kanji.getDatasetVersion()).toBeNull();
  });

  it('records the dataset version that ReviewLog.datasetVersion should reference', async () => {
    await loadDatasetContent(deps(), V1, thaiFor(V1));
    const version = await repos.kanji.getDatasetVersion();
    await repos.review.appendLog(makeLog({ id: 'log-v', datasetVersion: version }));
    const logs = await repos.review.getLogs({ from: new Date(0), to: new Date(8.64e15) });
    expect(logs.find((l) => l.id === 'log-v')?.datasetVersion).toBe('n5-v1');
  });
});
