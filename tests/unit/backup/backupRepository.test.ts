import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAppServices } from '../../../src/app/bootstrap';
import type { Repositories } from '../../../src/repositories/indexeddb';
import type { UserDataSnapshot } from '../../../src/repositories/interfaces';
import { BackupError } from '../../../src/services/backup/backupErrors';
import { applyImport, createBackup, prepareImport, resetProgress, resetSettings, type BackupDeps } from '../../../src/services/backup/backupService';
import { buildSearchIndex } from '../../../src/services/kanjiSearch/searchKanji';
import { loadSearchCorpus } from '../../../src/services/kanjiSearch/loadSearchCorpus';
import { DEFAULT_USER_SETTINGS } from '../../../src/services/settings/defaults';
import { computeStatistics } from '../../../src/services/statistics/statisticsService';
import { srsV1 } from '../../../src/services/srs';
import { RepositoryError, ValidationError } from '../../../src/utils/errors';
import { sampleRecords, validBackup } from '../../helpers/backupFixtures';
import { streak } from '../../helpers/fixtures';
import { openRealRepositories } from '../../helpers/realData';
import { NOON, realProjectList, storedCard } from '../../helpers/sessionFixtures';

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await dispose();
});

const deps = (now = NOON): BackupDeps => ({ backup: repos.backup, kanji: repos.kanji, now: () => now });
const snapshotOf = (data: Awaited<ReturnType<Repositories['backup']['readUserData']>>): UserDataSnapshot => ({
  reviewCards: data.reviewCards,
  reviewLogs: data.reviewLogs,
  studySessions: data.studySessions,
  userSettings: data.userSettings,
});
const read = async () => snapshotOf(await repos.backup.readUserData());
const fileOf = async (now = NOON) => JSON.stringify((await createBackup(deps(now))).backup);

async function seedSample(): Promise<UserDataSnapshot> {
  const { cards, logs, sessions } = sampleRecords();
  await repos.backup.replaceUserData({ reviewCards: cards, reviewLogs: logs, studySessions: sessions, userSettings: { ...DEFAULT_USER_SETTINGS, dailyNewCards: 5 } });
  return read();
}

describe('export', () => {
  it('builds a versioned envelope from the stored user data and changes nothing', async () => {
    const before = await seedSample();
    const { backup, fileName } = await createBackup(deps(new Date(2026, 9, 4, 9).getTime()));
    expect(backup).toMatchObject({ format: 'n5-kanji-review-backup', formatVersion: 1, databaseSchemaVersion: 2, datasetVersion: 'n5-2026.10.01', algorithmVersion: 'srs-v1' });
    expect(backup.exportedAt).toBe(new Date(2026, 9, 4, 9).toISOString());
    expect(fileName).toBe('n5-kanji-backup-2026-10-04.json');
    expect(backup.data.reviewCards).toEqual(before.reviewCards);
    expect(backup.data.reviewLogs).toEqual(before.reviewLogs);
    expect(backup.data.studySessions).toEqual(before.studySessions);
    expect(backup.data.userSettings).toEqual(before.userSettings);
    expect(await read()).toEqual(before);
    expect(Object.keys(backup)).not.toContain('streakState');
    expect(JSON.stringify(backup)).not.toContain('"meanings"'); // no dataset content
  });

  it('an empty database exports empty lists and null settings', async () => {
    const { backup } = await createBackup(deps());
    expect(backup.data).toEqual({ reviewCards: [], reviewLogs: [], studySessions: [], userSettings: null });
  });
});

describe('round trip: seed -> export -> reset -> import -> identical state', () => {
  it('restores the persisted records exactly; statistics and search states match', async () => {
    const services = buildAppServices(repos);
    for (const [i, character] of ['水', '火', '山'].entries()) {
      for (const rating of ['GOOD', 'AGAIN', 'EASY'] as const) {
        await services.reviewOrchestrator!.submit({ item: { itemType: 'kanji', itemId: (await repos.kanji.search(character))[0]!.id }, mode: 'A', rating, answeredAt: NOON - 10_000 + i * 1_000 + rating.length, durationMs: 1_500 });
      }
    }
    await repos.review.saveSession({ id: 'session-x', startedAt: NOON - 20_000, endedAt: NOON, cardIds: [], summary: { reviewedCount: 9, correctCount: 6, incorrectCount: 3 } });
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, dailyReviewLimit: 50, theme: 'dark' });

    const before = await read();
    const statsBefore = await computeStatistics({ review: repos.review, kanji: repos.kanji, now: () => NOON });
    const searchBefore = buildSearchIndex(await loadSearchCorpus({ kanji: repos.kanji, review: repos.review, newItems: realProjectList })).map((e) => [e.kanji.id, e.review]);
    const file = await fileOf();

    await resetProgress({ backup: repos.backup });
    expect((await read()).reviewCards).toEqual([]);

    const plan = await prepareImport(deps(), file);
    await applyImport(deps(), plan);

    expect(await read()).toEqual(before);
    expect(await computeStatistics({ review: repos.review, kanji: repos.kanji, now: () => NOON })).toEqual(statsBefore);
    const searchAfter = buildSearchIndex(await loadSearchCorpus({ kanji: repos.kanji, review: repos.review, newItems: realProjectList })).map((e) => [e.kanji.id, e.review]);
    expect(searchAfter).toEqual(searchBefore);
  });

  it('restores SRS state exactly and never runs the SRS algorithm', async () => {
    const update = vi.spyOn(srsV1, 'updateCardState');
    const create = vi.spyOn(srsV1, 'createNewCard');
    const file = JSON.stringify(validBackup());
    await applyImport(deps(), await prepareImport(deps(), file));
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    const restored = await read();
    expect(restored.reviewCards).toEqual([...validBackup().data.reviewCards].sort((a, b) => (a.id < b.id ? -1 : 1)));
  });
});

describe('replace semantics', () => {
  it('the backup becomes the whole user state: data that is not in it is gone', async () => {
    await repos.review.saveCard(storedCard('木', 'D', { state: 'REVIEW', reviewCount: 1 }));
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, dailyNewCards: 30 });
    await applyImport(deps(), await prepareImport(deps(), JSON.stringify(validBackup())));
    expect(await repos.review.getCard(storedCard('木', 'D').id)).toBeNull();
    expect((await repos.settings.get())?.dailyNewCards).toBe(20);
  });

  it('a backup without settings (null) removes the saved settings in the same transaction', async () => {
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, dailyNewCards: 30 });
    await applyImport(deps(), await prepareImport(deps(), JSON.stringify(validBackup({}, { userSettings: null }))));
    expect(await repos.settings.get()).toBeNull();
    expect((await read()).reviewCards).toHaveLength(4);
  });
});

describe('atomicity: a failed import leaves the database exactly as it was', () => {
  it('failure injected on the 3rd log write, after cards were written: full rollback', async () => {
    const before = await seedSample();
    const realAdd = IDBObjectStore.prototype.add;
    let logWrites = 0;
    const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof realAdd>) {
      if (this.name === 'reviewLogs' && ++logWrites === 3) throw new Error('injected disk failure');
      return realAdd.apply(this, args);
    });
    const plan = await prepareImport(deps(), JSON.stringify(validBackup()));
    await expect(applyImport(deps(), plan)).rejects.toMatchObject({ code: 'IMPORT_TRANSACTION_FAILED' });
    // the import had really cleared the stores and written cards inside the transaction ...
    expect(add.mock.contexts.some((store) => (store as IDBObjectStore).name === 'reviewCards')).toBe(true);
    vi.restoreAllMocks();
    // ... and all of it was rolled back
    expect(await read()).toEqual(before);
  });

  it('a duplicate id reaching the repository fails the add and rolls everything back', async () => {
    const before = await seedSample();
    const { cards, logs, sessions } = sampleRecords();
    await expect(
      repos.backup.replaceUserData({ reviewCards: cards, reviewLogs: [...logs, logs[0]!], studySessions: sessions, userSettings: null }),
    ).rejects.toBeInstanceOf(RepositoryError);
    expect(await read()).toEqual(before);
  });

  it('an invalid record handed straight to the repository is rejected before anything is cleared', async () => {
    const before = await seedSample();
    const { cards, logs, sessions } = sampleRecords();
    await expect(
      repos.backup.replaceUserData({ reviewCards: [...cards, { ...cards[0]!, id: 'x', state: 'BOGUS' as never }], reviewLogs: logs, studySessions: sessions, userSettings: null }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await read()).toEqual(before);
  });

  it.each([
    ['invalid JSON', '{"format":'],
    ['invalid schema', JSON.stringify({ ...validBackup(), formatVersion: 1, exportedAt: 'nope' })],
    ['dataset mismatch', JSON.stringify(validBackup({ datasetVersion: 'n5-1999.01.01' }))],
    ['algorithm mismatch', JSON.stringify(validBackup({ algorithmVersion: 'srs-v2' }))],
    ['duplicate ids', JSON.stringify(validBackup({}, { reviewLogs: [validBackup().data.reviewLogs[0]!, validBackup().data.reviewLogs[0]!] }))],
    ['partial corruption', JSON.stringify(validBackup({}, { studySessions: [{ id: 'ok', startedAt: 1, endedAt: null, cardIds: [], summary: null }, { id: 'bad', startedAt: 'x' } as never] }))],
  ])('%s: rejected with nothing written', async (_label, text) => {
    const before = await seedSample();
    await expect(prepareImport(deps(), text)).rejects.toBeInstanceOf(BackupError);
    expect(await read()).toEqual(before);
  });

  it('the dataset changing between the check and the restore is caught', async () => {
    const plan = await prepareImport(deps(), JSON.stringify(validBackup()));
    const kanji = Object.assign(Object.create(repos.kanji) as Repositories['kanji'], { getDatasetVersion: () => Promise.resolve('n5-2099.01.01') });
    await expect(applyImport({ ...deps(), kanji }, plan)).rejects.toMatchObject({ code: 'DATASET_MISMATCH' });
  });
});

describe('reset', () => {
  it('reset progress deletes cards, logs and sessions; settings, dataset and streakState stay', async () => {
    await seedSample();
    await repos.review.saveStreakState(streak);
    const settingsBefore = await repos.settings.get();
    await resetProgress({ backup: repos.backup });
    const after = await read();
    expect([after.reviewCards, after.reviewLogs, after.studySessions]).toEqual([[], [], []]);
    expect(await repos.settings.get()).toEqual(settingsBefore);
    expect(await repos.kanji.getByLevel('N5')).toHaveLength(196);
    expect(await repos.kanji.getDatasetVersion()).toBe('n5-2026.10.01');
    expect(await repos.review.getStreakState()).toEqual(streak);
  });

  it('a failing reset rolls back (nothing is half-deleted)', async () => {
    const before = await seedSample();
    const realClear = IDBObjectStore.prototype.clear;
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
      if (this.name === 'studySessions') throw new Error('injected');
      return realClear.apply(this);
    });
    await expect(resetProgress({ backup: repos.backup })).rejects.toBeInstanceOf(RepositoryError);
    vi.restoreAllMocks();
    expect(await read()).toEqual(before);
  });

  it('reset settings writes the approved defaults and keeps progress', async () => {
    const before = await seedSample();
    await resetSettings(repos.settings);
    expect(await repos.settings.get()).toEqual(DEFAULT_USER_SETTINGS);
    expect((await read()).reviewCards).toEqual(before.reviewCards);
  });
});
