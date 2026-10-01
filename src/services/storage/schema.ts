import type { DBSchema } from 'idb';
import type {
  ExampleSentence,
  JlptLevel,
  Kanji,
  KanjiReading,
  LearningState,
  ReviewCard,
  ReviewLog,
  StreakState,
  StudySession,
  UserSettings,
  Vocabulary,
} from '../../types/entities';

/** Store names. Content stores are read-only to the app; user stores are read-write. */
export const STORES = {
  // content
  kanji: 'kanji',
  kanjiReadings: 'kanjiReadings',
  vocabulary: 'vocabulary',
  exampleSentences: 'exampleSentences',
  // user data
  reviewCards: 'reviewCards',
  reviewLogs: 'reviewLogs',
  studySessions: 'studySessions',
  userSettings: 'userSettings',
  streakState: 'streakState',
} as const;

/** Out-of-line key for the single-record stores (userSettings, streakState). */
export const SINGLETON_KEY = 'current';

/**
 * Typed view of the LATEST schema, used by repositories. Migrations never use this type:
 * each migration is frozen and talks to an untyped database.
 */
export interface AppSchema extends DBSchema {
  kanji: { key: string; value: Kanji; indexes: { 'by-level': JlptLevel } };
  kanjiReadings: {
    key: [string, string, string];
    value: KanjiReading;
    indexes: { 'by-kanjiId': string };
  };
  vocabulary: { key: string; value: Vocabulary; indexes: { 'by-kanjiId': string } };
  exampleSentences: { key: string; value: ExampleSentence; indexes: { 'by-vocabId': string } };
  reviewCards: {
    key: string;
    value: ReviewCard;
    indexes: { 'by-due': number; 'by-state': LearningState };
  };
  reviewLogs: { key: string; value: ReviewLog; indexes: { 'by-reviewedAt': number } };
  studySessions: { key: string; value: StudySession };
  userSettings: { key: string; value: UserSettings };
  streakState: { key: string; value: StreakState };
}
