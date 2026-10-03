import type { AppDatabase } from '../../services/storage/database';
import { SINGLETON_KEY, STORES } from '../../services/storage/schema';
import {
  reviewCardSchema,
  reviewLogSchema,
  streakStateSchema,
  studySessionSchema,
} from '../../types/schemas';
import { LEARNING_STATES, type LearningState, type ReviewCard, type ReviewLog, type StreakState, type StudySession } from '../../types/entities';
import { ValidationError } from '../../utils/errors';
import type { DateRange, ReviewRepository } from '../interfaces';
import {
  assertLimit,
  parseRecord,
  parseRecords,
  runRepositoryOperation,
  toEpochMs,
} from './guard';

export class IndexedDbReviewRepository implements ReviewRepository {
  constructor(private readonly db: AppDatabase) {}

  getCard(id: string): Promise<ReviewCard | null> {
    return runRepositoryOperation('ReviewRepository.getCard', async () => {
      const record = await this.db.get(STORES.reviewCards, id);
      return record === undefined ? null : parseRecord(reviewCardSchema, record, 'review card');
    });
  }

  getDueCards(now: Date, limit: number): Promise<readonly ReviewCard[]> {
    return runRepositoryOperation('ReviewRepository.getDueCards', async () => {
      assertLimit(limit);
      const nowMs = toEpochMs(now, 'now');
      const due: ReviewCard[] = [];
      if (limit === 0) return due;

      const tx = this.db.transaction(STORES.reviewCards);
      const range = IDBKeyRange.upperBound(nowMs);
      for await (const cursor of tx.store.index('by-due').iterate(range)) {
        const card = parseRecord(reviewCardSchema, cursor.value, 'review card');
        if (card.state === 'NEW') continue;
        due.push(card);
        if (due.length >= limit) break;
      }
      await tx.done;
      return due;
    });
  }

  getCardsByStates(states: readonly LearningState[]): Promise<readonly ReviewCard[]> {
    return runRepositoryOperation('ReviewRepository.getCardsByStates', async () => {
      for (const state of states) {
        if (!LEARNING_STATES.includes(state)) throw new ValidationError(`Unknown learning state: ${String(state)}`);
      }
      const unique = [...new Set(states)];
      if (unique.length === 0) return [];
      const tx = this.db.transaction(STORES.reviewCards);
      const index = tx.store.index('by-state');
      const batches = await Promise.all(unique.map((state) => index.getAll(state)));
      await tx.done;
      return parseRecords(reviewCardSchema, batches.flat(), 'review card').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    });
  }

  getNewCards(limit: number): Promise<readonly ReviewCard[]> {
    return runRepositoryOperation('ReviewRepository.getNewCards', async () => {
      assertLimit(limit);
      const records = await this.db.getAllFromIndex(STORES.reviewCards, 'by-state', 'NEW');
      return parseRecords(reviewCardSchema, records, 'review card')
        .sort((a, b) => a.due - b.due || a.id.localeCompare(b.id))
        .slice(0, limit);
    });
  }

  saveCard(card: ReviewCard): Promise<void> {
    return runRepositoryOperation('ReviewRepository.saveCard', async () => {
      const valid = parseRecord(reviewCardSchema, card, 'review card');
      await this.db.put(STORES.reviewCards, valid);
    });
  }

  appendLog(log: ReviewLog): Promise<void> {
    return runRepositoryOperation('ReviewRepository.appendLog', async () => {
      const valid = parseRecord(reviewLogSchema, log, 'review log');
      await this.db.add(STORES.reviewLogs, valid);
    });
  }

  recordReview(card: ReviewCard, log: ReviewLog): Promise<void> {
    return runRepositoryOperation('ReviewRepository.recordReview', async () => {
      // Validate both BEFORE opening the transaction: nothing is written if either is invalid.
      const validCard = parseRecord(reviewCardSchema, card, 'review card');
      const validLog = parseRecord(reviewLogSchema, log, 'review log');
      if (validLog.cardId !== validCard.id) {
        throw new ValidationError('review log cardId must match the review card id');
      }
      // One readwrite transaction over both stores; the card is written first so a failing log add proves rollback.
      const tx = this.db.transaction([STORES.reviewCards, STORES.reviewLogs], 'readwrite');
      const done = tx.done;
      try {
        await tx.objectStore(STORES.reviewCards).put(validCard);
        await tx.objectStore(STORES.reviewLogs).add(validLog); // add, never put: an existing log is never overwritten
        await done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // already finished or aborted
        }
        await done.catch(() => undefined);
        throw error;
      }
    });
  }

  getLogs(range: DateRange): Promise<readonly ReviewLog[]> {
    return runRepositoryOperation('ReviewRepository.getLogs', async () => {
      const from = toEpochMs(range.from, 'range.from');
      const to = toEpochMs(range.to, 'range.to');
      if (from > to) throw new ValidationError('range.from must not be after range.to');
      if (from === to) return [];
      const records = await this.db.getAllFromIndex(
        STORES.reviewLogs,
        'by-reviewedAt',
        IDBKeyRange.bound(from, to, false, true),
      );
      return parseRecords(reviewLogSchema, records, 'review log');
    });
  }

  saveSession(session: StudySession): Promise<void> {
    return runRepositoryOperation('ReviewRepository.saveSession', async () => {
      const valid = parseRecord(studySessionSchema, session, 'study session');
      await this.db.put(STORES.studySessions, valid);
    });
  }

  getStreakState(): Promise<StreakState | null> {
    return runRepositoryOperation('ReviewRepository.getStreakState', async () => {
      const record = await this.db.get(STORES.streakState, SINGLETON_KEY);
      return record === undefined ? null : parseRecord(streakStateSchema, record, 'streak state');
    });
  }

  saveStreakState(state: StreakState): Promise<void> {
    return runRepositoryOperation('ReviewRepository.saveStreakState', async () => {
      const valid = parseRecord(streakStateSchema, state, 'streak state');
      await this.db.put(STORES.streakState, valid, SINGLETON_KEY);
    });
  }
}
