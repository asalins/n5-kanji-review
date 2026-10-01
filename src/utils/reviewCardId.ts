import type { ItemType, StudyMode } from '../types/common';

/** ReviewCard ids are composed, never parsed (itemId may itself contain ':'). */
export function buildReviewCardId(itemType: ItemType, itemId: string, mode: StudyMode): string {
  return `${itemType}:${itemId}:${mode}`;
}
