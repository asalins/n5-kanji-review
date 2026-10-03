import { createNewCard } from '../srs';
import type { ItemRef, ReviewCard, StudyMode } from '../../types/entities';

/** The one place the session layer creates cards; the starting values belong to the SRS service. */
export function newCardFor(item: ItemRef, mode: StudyMode, now: number): ReviewCard {
  return createNewCard(item, mode, now);
}
