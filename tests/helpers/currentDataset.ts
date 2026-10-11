import { readFileSync } from 'node:fs';

/**
 * The dataset version of the bundled data/kanji/n5.json, read from disk.
 * Tests that run against the real dataset compare with this value instead of a literal,
 * so a KANJIDIC2 data refresh (new datasetVersion) does not require editing tests.
 */
export const CURRENT_DATASET_VERSION: string = (
  JSON.parse(readFileSync('data/kanji/n5.json', 'utf8')) as { datasetVersion: string }
).datasetVersion;
