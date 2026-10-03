import type { KanjiRepository, ReviewRepository } from '../../repositories/interfaces';
import { AppError } from '../../utils/errors';
import type { ItemRef, ReviewCard, StudySession } from '../../types/entities';
import { buildReviewCardId } from '../../utils/reviewCardId';
import { localDay } from '../../utils/localDay';
import { computeAllowance, type DailyAllowance, type DailyLimits } from './allowance';
import { newCardFor } from './cardFactory';
import { DEFAULT_DAILY_NEW_LIMIT, DEFAULT_DAILY_REVIEW_LIMIT, NEW_CARD_MODE_ORDER } from './config';
import type { EmptyReason, NewItemSource, PlannedCard } from './types';

export interface SessionEngineDeps {
  readonly review: ReviewRepository;
  readonly kanji: Pick<KanjiRepository, 'getById'>;
  readonly newItems: NewItemSource;
  /** Injected clock (epoch ms). The engine never reads the system clock itself. */
  readonly now: () => number;
  readonly limits?: DailyLimits;
}

/** The Project N5 list names kanji but none of them exists in the content stores: the dataset is not loaded. */
export class DatasetUnavailableError extends AppError {}

export interface SessionPlan {
  readonly startedAt: number;
  readonly localDate: string;
  readonly allowance: DailyAllowance;
  /** Due cards first (due ascending, then id), then new cards (project list order, modes A-D). */
  readonly cards: readonly PlannedCard[];
  /** Set only when `cards` is empty. */
  readonly emptyReason: EmptyReason | null;
}

const DEFAULT_LIMITS: DailyLimits = { newCards: DEFAULT_DAILY_NEW_LIMIT, reviews: DEFAULT_DAILY_REVIEW_LIMIT };

interface NewCandidate {
  readonly item: ItemRef;
  readonly mode: ReviewCard['mode'];
  /** The stored NEW card, or null when the card does not exist yet and must be created. */
  readonly existing: ReviewCard | null;
}

/**
 * NEW cards = no ReviewCard yet, or a stored card still in state NEW (never successfully reviewed), walked in
 * project list order with modes A-D. Introduced cards (any other state) are skipped. Nothing is written here.
 */
async function findNewCandidates(deps: SessionEngineDeps, limit: number): Promise<NewCandidate[]> {
  if (limit === 0) return [];
  const found: NewCandidate[] = [];
  const items = await deps.newItems.getOrderedItems();
  let presentInDataset = 0;
  for (const item of items) {
    if (item.itemType === 'kanji' && (await deps.kanji.getById(item.itemId)) === null) continue; // not in the dataset
    presentInDataset += 1;
    for (const mode of NEW_CARD_MODE_ORDER) {
      const existing = await deps.review.getCard(buildReviewCardId(item.itemType, item.itemId, mode));
      if (existing !== null && existing.state !== 'NEW') continue;
      found.push({ item, mode, existing });
      if (found.length === limit) return found;
    }
  }
  // Walked the whole list without meeting a single dataset kanji: that is missing data, not "nothing to learn".
  if (items.length > 0 && presentInDataset === 0) {
    throw new DatasetUnavailableError('The kanji dataset is not available in the content stores');
  }
  return found;
}

/**
 * Builds today's queue. Reads only: logs for the local day, due cards, the project list. The only writes are
 * the lazily created NEW cards that are actually in the queue (never all 196 x 4).
 */
export async function planSession(deps: SessionEngineDeps): Promise<SessionPlan> {
  const limits = deps.limits ?? DEFAULT_LIMITS;
  const startedAt = deps.now();
  const day = localDay(startedAt);

  const logsToday = await deps.review.getLogs({ from: day.from, to: day.to });
  const allowance = computeAllowance(logsToday, limits);

  const dueCandidates =
    allowance.remainingReviews > 0 ? await deps.review.getDueCards(new Date(startedAt), allowance.remainingReviews) : [];
  const due: PlannedCard[] = [];
  const dueOrdered = [...dueCandidates].sort((a, b) => a.due - b.due || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const card of dueOrdered) {
    if (card.itemType === 'kanji' && (await deps.kanji.getById(card.itemId)) === null) continue;
    due.push({ card, kind: 'due' });
  }

  const candidates = await findNewCandidates(deps, allowance.remainingNew);
  const fresh: PlannedCard[] = [];
  for (const candidate of candidates) {
    const card = candidate.existing ?? newCardFor(candidate.item, candidate.mode, startedAt);
    if (candidate.existing === null) await deps.review.saveCard(card); // lazy creation, only what the queue needs
    fresh.push({ card, kind: 'new' });
  }

  const cards = [...due, ...fresh];
  let emptyReason: EmptyReason | null = null;
  if (cards.length === 0) {
    const dueBlocked = allowance.remainingReviews === 0 && (await deps.review.getDueCards(new Date(startedAt), 1)).length > 0;
    const newBlocked = allowance.remainingNew === 0 && (await findNewCandidates(deps, 1)).length > 0;
    emptyReason = dueBlocked || newBlocked ? 'LIMITS_REACHED' : 'NOTHING_AVAILABLE';
  }
  return { startedAt, localDate: day.key, allowance, cards, emptyReason };
}

export function startedSession(plan: SessionPlan, cardIds: readonly string[]): StudySession {
  return { id: `session-${plan.startedAt}`, startedAt: plan.startedAt, endedAt: null, cardIds, summary: null };
}
