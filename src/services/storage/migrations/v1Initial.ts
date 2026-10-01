import { STORES } from '../schema';
import type { Migration } from '../database';

/**
 * v1: initial schema. Every index exists for a concrete repository query:
 *  - kanji.by-level                 -> KanjiRepository.getByLevel / search filter
 *  - kanjiReadings.by-kanjiId       -> KanjiRepository.getReadings
 *  - vocabulary.by-kanjiId (multi)  -> KanjiRepository.getVocabulary
 *  - exampleSentences.by-vocabId    -> KanjiRepository.getExamples (via the kanji's vocabulary)
 *  - reviewCards.by-due             -> ReviewRepository.getDueCards
 *  - reviewCards.by-state           -> ReviewRepository.getNewCards
 *  - reviewLogs.by-reviewedAt       -> ReviewRepository.getLogs
 * studySessions, userSettings, streakState are read by primary key only (no index).
 */
export const migrationV1: Migration = {
  version: 1,
  description: 'Initial schema: content stores, review cards/logs, sessions, settings, streak',
  migrate(db) {
    // Content (read-only for users, loaded from the versioned dataset)
    const kanji = db.createObjectStore(STORES.kanji, { keyPath: 'id' });
    kanji.createIndex('by-level', 'level');

    const readings = db.createObjectStore(STORES.kanjiReadings, {
      keyPath: ['kanjiId', 'type', 'kana'],
    });
    readings.createIndex('by-kanjiId', 'kanjiId');

    const vocabulary = db.createObjectStore(STORES.vocabulary, { keyPath: 'id' });
    vocabulary.createIndex('by-kanjiId', 'kanjiIds', { multiEntry: true });

    const sentences = db.createObjectStore(STORES.exampleSentences, { keyPath: 'id' });
    sentences.createIndex('by-vocabId', 'vocabIds', { multiEntry: true });

    // User data (read-write)
    const cards = db.createObjectStore(STORES.reviewCards, { keyPath: 'id' });
    cards.createIndex('by-due', 'due');
    cards.createIndex('by-state', 'state');

    const logs = db.createObjectStore(STORES.reviewLogs, { keyPath: 'id' });
    logs.createIndex('by-reviewedAt', 'reviewedAt');

    db.createObjectStore(STORES.studySessions, { keyPath: 'id' });

    // Singletons use out-of-line keys (SINGLETON_KEY)
    db.createObjectStore(STORES.userSettings);
    db.createObjectStore(STORES.streakState);
  },
};
