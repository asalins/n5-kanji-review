import { readFileSync } from 'node:fs';
import { createIndexedDbRepositories, type Repositories } from '../../src/repositories/indexeddb';
import { loadDatasetContent } from '../../src/services/content/loadDataset';
import type { KanjiCardData } from '../../src/features/flashcards/presentation';
import { makeKanjiId } from '../../src/utils/kanjiId';
import { openTestDatabase } from './testDatabase';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** Real n5.json / n5.th.json loaded through the real repositories into a fresh fake IndexedDB. */
export async function openRealRepositories(): Promise<{ repos: Repositories; dispose: () => Promise<void> }> {
  const { db, dispose } = await openTestDatabase();
  const repos = createIndexedDbRepositories(db);
  await loadDatasetContent(
    { writer: repos.contentWriter, reader: repos.kanji, now: () => 1 },
    read('data/kanji/n5.json'),
    read('data/kanji/n5.th.json'),
  );
  return { repos, dispose };
}

export async function realCard(repos: Repositories, character: string): Promise<KanjiCardData> {
  const id = makeKanjiId(character);
  const kanji = await repos.kanji.getById(id);
  if (kanji === null) throw new Error(`${character} not found in the real dataset`);
  return { kanji, readings: await repos.kanji.getReadings(id) };
}
