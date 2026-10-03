import type { ItemRef, ReviewCard } from '../../types/entities';

/** Ordered curriculum of items that can become NEW cards (the Project N5 list, 1..196). */
export interface NewItemSource {
  getOrderedItems(): Promise<readonly ItemRef[]>;
}

export type EmptyReason =
  /** Cards exist but today's limits are used up. */
  | 'LIMITS_REACHED'
  /** Nothing is due and there is no new card to introduce. */
  | 'NOTHING_AVAILABLE';

export interface PlannedCard {
  readonly card: ReviewCard;
  readonly kind: 'due' | 'new';
}
