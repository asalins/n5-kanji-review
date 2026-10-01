import type { AppDatabase } from '../../services/storage/database';
import { STORES } from '../../services/storage/schema';
import { contentBundleSchema } from '../../types/schemas';
import type { ContentBundle } from '../../types/entities';
import type { ContentWriter } from '../interfaces';
import { parseRecord, runRepositoryOperation } from './guard';

export class IndexedDbContentWriter implements ContentWriter {
  constructor(private readonly db: AppDatabase) {}

  saveContent(bundle: ContentBundle): Promise<void> {
    return runRepositoryOperation('ContentWriter.saveContent', async () => {
      const valid = parseRecord(contentBundleSchema, bundle, 'content bundle');
      const tx = this.db.transaction(
        [STORES.kanji, STORES.kanjiReadings, STORES.vocabulary, STORES.exampleSentences],
        'readwrite',
      );
      await Promise.all([
        ...valid.kanji.map((item) => tx.objectStore(STORES.kanji).put(item)),
        ...valid.readings.map((item) => tx.objectStore(STORES.kanjiReadings).put(item)),
        ...valid.vocabulary.map((item) => tx.objectStore(STORES.vocabulary).put(item)),
        ...valid.examples.map((item) => tx.objectStore(STORES.exampleSentences).put(item)),
        tx.done,
      ]);
    });
  }
}
