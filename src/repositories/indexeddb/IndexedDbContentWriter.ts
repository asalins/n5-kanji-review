import type { AppDatabase } from '../../services/storage/database';
import { SINGLETON_KEY, STORES } from '../../services/storage/schema';
import { contentBundleSchema, contentMetaSchema } from '../../types/schemas';
import type { ContentBundle, ContentMeta } from '../../types/entities';
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

  replaceContent(bundle: ContentBundle, meta: ContentMeta): Promise<void> {
    return runRepositoryOperation('ContentWriter.replaceContent', async () => {
      // Validate everything first so invalid input never reaches (or clears) the stores.
      const valid = parseRecord(contentBundleSchema, bundle, 'content bundle');
      const validMeta = parseRecord(contentMetaSchema, meta, 'content meta');
      // Only content stores are in this transaction, so user data cannot be affected.
      const tx = this.db.transaction(
        [STORES.kanji, STORES.kanjiReadings, STORES.vocabulary, STORES.exampleSentences, STORES.contentMeta],
        'readwrite',
      );
      try {
        await Promise.all([
          tx.objectStore(STORES.kanji).clear(),
          tx.objectStore(STORES.kanjiReadings).clear(),
          tx.objectStore(STORES.vocabulary).clear(),
          tx.objectStore(STORES.exampleSentences).clear(),
        ]);
        await Promise.all([
          ...valid.kanji.map((item) => tx.objectStore(STORES.kanji).put(item)),
          ...valid.readings.map((item) => tx.objectStore(STORES.kanjiReadings).put(item)),
          ...valid.vocabulary.map((item) => tx.objectStore(STORES.vocabulary).put(item)),
          ...valid.examples.map((item) => tx.objectStore(STORES.exampleSentences).put(item)),
          tx.objectStore(STORES.contentMeta).put(validMeta, SINGLETON_KEY),
        ]);
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // already finished or aborted
        }
        throw error;
      }
    });
  }
}
