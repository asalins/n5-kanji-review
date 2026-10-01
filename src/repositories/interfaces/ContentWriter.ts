import type { ContentBundle } from '../../types/entities';

/**
 * Write side of the content stores. Used only by the dataset loader (Phase 3), never by UI/features.
 * Kept separate from KanjiRepository so content stays read-only for the application.
 */
export interface ContentWriter {
  /** Atomic upsert of a validated bundle: all of it is stored, or none of it. */
  saveContent(bundle: ContentBundle): Promise<void>;
}
