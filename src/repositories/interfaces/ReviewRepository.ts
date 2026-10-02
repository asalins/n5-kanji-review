import type { ReviewCard, ReviewLog, StreakState, StudySession } from '../../types/entities';

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

export interface ReviewRepository {
  getCard(id: string): Promise<ReviewCard | null>;
  getDueCards(now: Date, limit: number): Promise<readonly ReviewCard[]>;
  getNewCards(limit: number): Promise<readonly ReviewCard[]>;
  saveCard(card: ReviewCard): Promise<void>;
  appendLog(log: ReviewLog): Promise<void>;
  /**
   * One completed review: stores the updated card AND appends its log in a single transaction
   * (both or neither). The log id must be new: a duplicate fails the whole review and leaves the card unchanged.
   */
  recordReview(card: ReviewCard, log: ReviewLog): Promise<void>;
  getLogs(range: DateRange): Promise<readonly ReviewLog[]>;
  saveSession(session: StudySession): Promise<void>;
  getStreakState(): Promise<StreakState | null>;
  saveStreakState(state: StreakState): Promise<void>;
}
