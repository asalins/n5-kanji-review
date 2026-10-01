import type { AppDatabase } from '../../services/storage/database';
import { SINGLETON_KEY, STORES } from '../../services/storage/schema';
import {
  reviewCardSchema,
  reviewLogSchema,
  streakStateSchema,
  studySessionSchema,
} from '../../types/schemas';
import type { ReviewCard, ReviewLog, StreakState, StudySession } from '../../types/entities';
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
