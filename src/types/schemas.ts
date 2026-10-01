import { z } from 'zod';
import { buildReviewCardId } from '../utils/reviewCardId';
import {
  ITEM_TYPES,
  JLPT_LEVELS,
  LEARNING_STATES,
  READING_TYPES,
  REVIEW_RATINGS,
  STUDY_MODES,
  THEMES,
  UI_LANGUAGES,
} from './common';
import type { ContentBundle, ExampleSentence, Kanji, KanjiReading, Vocabulary } from './content';
import type { ReviewCard, ReviewLog, StreakState, StudySession, UserSettings } from './user';

/** Compile-time guarantee that each schema produces exactly its entity type. */
function conform<T>(schema: z.ZodType<T>): z.ZodType<T> {
  return schema;
}

// Structural constraints only. No SRS rules (what interval/ease/rating mean) are encoded here.
const id = z.string().min(1);
const text = z.string().min(1);
const epochMs = z.number().int().nonnegative();
const count = z.number().int().nonnegative();
const strings = z.array(z.string());

// ---------- content ----------

export const kanjiSchema = conform<Kanji>(
  z.object({
    id,
    character: z.string().refine((s) => [...s].length === 1, 'must be exactly one character'),
    level: z.enum(JLPT_LEVELS),
    strokeCount: z.number().int().positive(),
    frequency: z.number().int().positive().nullable(),
    meanings: z.object({ en: strings, th: strings }),
  }),
);

export const kanjiReadingSchema = conform<KanjiReading>(
  z.object({ kanjiId: id, type: z.enum(READING_TYPES), kana: text, romaji: text }),
);

export const vocabularySchema = conform<Vocabulary>(
  z.object({
    id,
    kanjiIds: z.array(id),
    word: text,
    reading: text,
    meaningEn: strings,
    meaningTh: strings,
  }),
);

export const exampleSentenceSchema = conform<ExampleSentence>(
  z.object({
    id,
    text,
    reading: text,
    meaningTh: z.string(),
    meaningEn: z.string(),
    vocabIds: z.array(id),
  }),
);

export const contentBundleSchema = conform<ContentBundle>(
  z.object({
    kanji: z.array(kanjiSchema),
    readings: z.array(kanjiReadingSchema),
    vocabulary: z.array(vocabularySchema),
    examples: z.array(exampleSentenceSchema),
  }),
);

// ---------- user data ----------

export const reviewCardSchema = conform<ReviewCard>(
  z.object({
    id,
    itemType: z.enum(ITEM_TYPES),
    itemId: id,
    mode: z.enum(STUDY_MODES),
    state: z.enum(LEARNING_STATES),
    interval: z.number().finite().nonnegative(),
    ease: z.number().finite(),
    due: epochMs,
    reviewCount: count,
    correctCount: count,
    incorrectCount: count,
    lastReviewed: epochMs.nullable(),
    algorithmVersion: text,
  })
    // Structural identity rule from Phase 0: id = itemType:itemId:mode
    .refine((card) => card.id === buildReviewCardId(card.itemType, card.itemId, card.mode), {
      message: 'id must equal itemType:itemId:mode',
      path: ['id'],
    }),
);

export const reviewLogSchema = conform<ReviewLog>(
  z.object({
    id,
    cardId: id,
    rating: z.enum(REVIEW_RATINGS),
    reviewedAt: epochMs,
    durationMs: count,
    stateBefore: z.enum(LEARNING_STATES),
    stateAfter: z.enum(LEARNING_STATES),
    datasetVersion: z.string().min(1).nullable(),
  }),
);

export const studySessionSchema = conform<StudySession>(
  z.object({
    id,
    startedAt: epochMs,
    endedAt: epochMs.nullable(),
    cardIds: z.array(id),
    summary: z
      .object({ reviewedCount: count, correctCount: count, incorrectCount: count })
      .nullable(),
  }),
);

export const userSettingsSchema = conform<UserSettings>(
  z.object({
    dailyNewCards: z.number().int().positive(),
    dailyReviewLimit: z.number().int().positive(),
    theme: z.enum(THEMES),
    uiLanguage: z.enum(UI_LANGUAGES),
    soundEnabled: z.boolean(),
    autoPlay: z.boolean(),
    studyMode: z.enum(STUDY_MODES),
    animationsEnabled: z.boolean(),
  }),
);

export const streakStateSchema = conform<StreakState>(
  z.object({
    lastStudyDate: epochMs.nullable(),
    currentStreak: count,
    longestStreak: count,
  }),
);
