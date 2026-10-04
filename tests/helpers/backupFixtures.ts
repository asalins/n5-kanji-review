import type { BackupV1 } from '../../src/services/backup/backupSchema';
import { DEFAULT_USER_SETTINGS } from '../../src/services/settings/defaults';
import type { ReviewCard, ReviewLog, StudySession } from '../../src/types/entities';
import { NOON, logAt, storedCard } from './sessionFixtures';

/** Realistic records for the real dataset (kanji ids of 水 / 火 / 山). Test data only. */
export function sampleRecords(): { cards: ReviewCard[]; logs: ReviewLog[]; sessions: StudySession[] } {
  const cards = [
    storedCard('水', 'A', { state: 'REVIEW', interval: 4_320, ease: 2_500, due: NOON + 3 * 86_400_000, reviewCount: 2, correctCount: 2, lastReviewed: NOON }),
    storedCard('水', 'B', { state: 'LEARNING', interval: 10, due: NOON + 600_000, reviewCount: 1, incorrectCount: 1, lastReviewed: NOON }),
    storedCard('火', 'A', { state: 'MASTERED', interval: 30_240, ease: 2_650, due: NOON - 1, reviewCount: 9, correctCount: 9, lastReviewed: NOON - 86_400_000 }),
    storedCard('山', 'C', { state: 'NEW' }),
  ];
  const logs = [
    logAt(1, NOON - 2_000, 'NEW', { cardId: cards[0]!.id, rating: 'GOOD', stateAfter: 'LEARNING' }),
    logAt(2, NOON - 1_000, 'LEARNING', { cardId: cards[0]!.id, rating: 'GOOD', stateAfter: 'REVIEW' }),
    logAt(3, NOON - 500, 'NEW', { cardId: cards[1]!.id, rating: 'AGAIN', stateAfter: 'LEARNING' }),
    logAt(4, NOON - 86_400_000, 'REVIEW', { cardId: cards[2]!.id, rating: 'EASY', stateAfter: 'MASTERED' }),
  ];
  const sessions: StudySession[] = [
    { id: 'session-1', startedAt: NOON - 3_000, endedAt: NOON, cardIds: [cards[0]!.id, cards[1]!.id, cards[3]!.id], summary: { reviewedCount: 3, correctCount: 2, incorrectCount: 1 } },
  ];
  return { cards, logs, sessions };
}

export function validBackup(over: Partial<BackupV1> = {}, data: Partial<BackupV1['data']> = {}): BackupV1 {
  const { cards, logs, sessions } = sampleRecords();
  return {
    format: 'n5-kanji-review-backup',
    formatVersion: 1,
    exportedAt: '2026-10-02T05:00:00.000Z',
    databaseSchemaVersion: 2,
    datasetVersion: 'n5-2026.10.01',
    algorithmVersion: 'srs-v1',
    data: { reviewCards: cards, reviewLogs: logs, studySessions: sessions, userSettings: { ...DEFAULT_USER_SETTINGS, dailyNewCards: 20 }, ...data },
    ...over,
  };
}
