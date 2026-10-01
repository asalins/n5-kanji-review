import type {
  ContentBundle,
  ReviewCard,
  ReviewLog,
  StreakState,
  StudySession,
  UserSettings,
} from '../../src/types/entities';
import { buildReviewCardId } from '../../src/utils/reviewCardId';

/** Tiny SYNTHETIC fixtures for tests only; not the production dataset. */
export const contentBundle: ContentBundle = {
  kanji: [
    { id: 'kanji:water', character: '水', level: 'N5', strokeCount: 4, frequency: 100, meanings: { en: ['water'], th: ['น้ำ'] } },
    { id: 'kanji:fire', character: '火', level: 'N5', strokeCount: 4, frequency: null, meanings: { en: ['fire'], th: ['ไฟ'] } },
    { id: 'kanji:mountain', character: '山', level: 'N4', strokeCount: 3, frequency: 200, meanings: { en: ['mountain'], th: ['ภูเขา'] } },
  ],
  readings: [
    { kanjiId: 'kanji:water', type: 'kun', kana: 'みず', romaji: 'mizu' },
    { kanjiId: 'kanji:water', type: 'on', kana: 'スイ', romaji: 'sui' },
    { kanjiId: 'kanji:fire', type: 'kun', kana: 'ひ', romaji: 'hi' },
  ],
  vocabulary: [
    { id: 'vocab:water-day', kanjiIds: ['kanji:water'], word: '水曜日', reading: 'すいようび', meaningEn: ['Wednesday'], meaningTh: ['วันพุธ'] },
    { id: 'vocab:fire-water', kanjiIds: ['kanji:fire', 'kanji:water'], word: '火水', reading: 'かすい', meaningEn: ['fire and water'], meaningTh: [] },
  ],
  examples: [
    { id: 'ex:1', text: '水を飲みます。', reading: 'みずをのみます。', meaningTh: 'ฉันดื่มน้ำ', meaningEn: 'I drink water.', vocabIds: ['vocab:water-day'] },
    { id: 'ex:2', text: '火水です。', reading: 'かすいです。', meaningTh: '', meaningEn: 'It is fire and water.', vocabIds: ['vocab:water-day', 'vocab:fire-water'] },
  ],
};

export function makeCard(overrides: Partial<ReviewCard> = {}): ReviewCard {
  const base = {
    itemType: 'kanji',
    itemId: 'kanji:water',
    mode: 'A',
    state: 'NEW',
    interval: 0,
    ease: 0,
    due: 1_000,
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    lastReviewed: null,
    algorithmVersion: 'test-v0',
    ...overrides,
  } as const;
  return { ...base, id: buildReviewCardId(base.itemType, base.itemId, base.mode) };
}

export function makeLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: 'log:1',
    cardId: 'kanji:kanji:water:A',
    rating: 'GOOD',
    reviewedAt: 5_000,
    durationMs: 1_200,
    stateBefore: 'NEW',
    stateAfter: 'LEARNING',
    datasetVersion: 'test-dataset-1',
    ...overrides,
  };
}

export const session: StudySession = {
  id: 'session:1',
  startedAt: 1_000,
  endedAt: null,
  cardIds: ['kanji:kanji:water:A'],
  summary: null,
};

export const settings: UserSettings = {
  dailyNewCards: 10,
  dailyReviewLimit: 50,
  theme: 'system',
  uiLanguage: 'th',
  soundEnabled: false,
  autoPlay: false,
  studyMode: 'A',
  animationsEnabled: true,
};

export const streak: StreakState = { lastStudyDate: 9_000, currentStreak: 3, longestStreak: 7 };
