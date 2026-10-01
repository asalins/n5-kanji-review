import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepositories, type Repositories } from '../../../src/repositories/indexeddb';
import { RepositoryError, ValidationError } from '../../../src/utils/errors';
import type { AppDatabase } from '../../../src/services/storage/database';
import type { Kanji } from '../../../src/types/entities';
import { openTestDatabase } from '../../helpers/testDatabase';
import { contentBundle } from '../../helpers/fixtures';

let repos: Repositories;
let db: AppDatabase;
let dispose: () => Promise<void>;

beforeEach(async () => {
  ({ db, dispose } = await openTestDatabase());
  repos = createIndexedDbRepositories(db);
  await repos.contentWriter.saveContent(contentBundle);
});
afterEach(() => dispose());

describe('KanjiRepository', () => {
  it('gets a kanji by id, or null when missing', async () => {
    expect((await repos.kanji.getById('kanji:water'))?.character).toBe('水');
    expect(await repos.kanji.getById('kanji:nope')).toBeNull();
  });

  it('gets kanji by level', async () => {
    const n5 = await repos.kanji.getByLevel('N5');
    expect(n5.map((k) => k.character).sort()).toEqual(['水', '火'].sort());
    expect(await repos.kanji.getByLevel('N1')).toEqual([]);
  });

  it('searches by character, meaning (en/th), reading, romaji and vocabulary', async () => {
    const ids = async (q: string) => (await repos.kanji.search(q)).map((k) => k.id).sort();
    // 火水 (vocabulary) contains 水, so fire also matches through its vocabulary
    expect(await ids('水')).toEqual(['kanji:fire', 'kanji:water']);
    expect(await ids('水曜')).toEqual(['kanji:water']);
    expect(await ids('WATER')).toEqual(['kanji:fire', 'kanji:water']); // case-insensitive; 'fire and water' vocab links both
    expect(await ids('Wednesday')).toEqual(['kanji:water']);
    expect(await ids('ภูเขา')).toEqual(['kanji:mountain']);
    expect(await ids('みず')).toEqual(['kanji:water']);
    expect(await ids('hi')).toContain('kanji:fire');
    expect(await ids('วันพุธ')).toEqual(['kanji:water']);
    expect(await ids('fire and water')).toEqual(['kanji:fire', 'kanji:water']);
    expect(await ids('zzz')).toEqual([]);
  });

  it('applies the level filter and returns all kanji for an empty query', async () => {
    expect((await repos.kanji.search('', { level: 'N4' })).map((k) => k.id)).toEqual(['kanji:mountain']);
    expect(await repos.kanji.search('  ')).toHaveLength(3);
    expect(await repos.kanji.search('water', { level: 'N4' })).toEqual([]);
  });

  it('gets vocabulary through the multiEntry kanjiIds index', async () => {
    expect((await repos.kanji.getVocabulary('kanji:water')).map((v) => v.id).sort()).toEqual(['vocab:fire-water', 'vocab:water-day']);
    expect((await repos.kanji.getVocabulary('kanji:fire')).map((v) => v.id)).toEqual(['vocab:fire-water']);
    expect(await repos.kanji.getVocabulary('kanji:mountain')).toEqual([]);
  });

  it('gets de-duplicated example sentences via the kanji vocabulary', async () => {
    // ex:2 is linked to two of water's vocabulary entries but must appear once
    expect((await repos.kanji.getExamples('kanji:water')).map((e) => e.id)).toEqual(['ex:1', 'ex:2']);
    expect((await repos.kanji.getExamples('kanji:fire')).map((e) => e.id)).toEqual(['ex:2']);
  });

  it('gets readings for a kanji', async () => {
    const readings = await repos.kanji.getReadings('kanji:water');
    expect(readings.map((r) => r.kana).sort()).toEqual(['みず', 'スイ'].sort());
  });

  it('content save is an upsert and is idempotent', async () => {
    await repos.contentWriter.saveContent(contentBundle);
    expect(await repos.kanji.search('')).toHaveLength(3);
    expect(await repos.kanji.getReadings('kanji:water')).toHaveLength(2);
  });

  it('rejects an invalid bundle without writing anything (ValidationError)', async () => {
    const bad = { ...contentBundle, kanji: [{ ...contentBundle.kanji[0], level: 'N9' } as unknown as Kanji] };
    await expect(repos.contentWriter.saveContent({ ...bad, vocabulary: [], readings: [], examples: [] })).rejects.toBeInstanceOf(ValidationError);
    expect(await repos.kanji.getById('kanji:water')).not.toBeNull();
  });

  it('reports corrupted stored data as ValidationError', async () => {
    await db.put('kanji', { id: 'kanji:broken' } as unknown as Kanji);
    await expect(repos.kanji.getById('kanji:broken')).rejects.toBeInstanceOf(ValidationError);
  });

  it('wraps storage failures as RepositoryError', async () => {
    db.close();
    await expect(repos.kanji.getById('kanji:water')).rejects.toBeInstanceOf(RepositoryError);
  });
});
