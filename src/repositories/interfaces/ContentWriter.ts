import type { ContentBundle, ContentMeta } from '../../types/entities';

/**
 * Write side of the CONTENT stores only (kanji, readings, vocabulary, examples, contentMeta).
 * Used by the dataset loader, never by UI/features. User data (cards, logs, sessions, settings,
 * streak) is a different set of stores and is never touched by anything here.
 */
export interface ContentWriter {
  /** Atomic upsert. Does NOT remove records that are absent from the bundle. */
  saveContent(bundle: ContentBundle): Promise<void>;
  /**
   * Atomic replace: clears the content stores, writes the complete bundle and the dataset
   * metadata in one transaction. Either everything is replaced or nothing changes.
   */
  replaceContent(bundle: ContentBundle, meta: ContentMeta): Promise<void>;
}
