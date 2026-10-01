import { z } from 'zod';
import { JLPT_LEVELS } from '../../types/common';
import { kanjiReadingSchema } from '../../types/schemas';

/**
 * Shapes of the application dataset files (data/kanji/n5.json, n5.th.json).
 * Shared by the build pipeline (scripts/dataset) and the runtime loader.
 * Source data (English) and Thai meanings live in separate files on purpose.
 */

export const sourceInfoSchema = z.object({
  name: z.string().min(1),
  /** Version string from the source itself, or null when the source does not state one. */
  version: z.string().min(1).nullable(),
  date: z.string().min(1).nullable(),
  officialUrl: z.url(),
  license: z.string().min(1),
});
export type SourceInfo = z.infer<typeof sourceInfoSchema>;

const id = z.string().min(1);

export const datasetKanjiSchema = z.object({
  id,
  character: z.string().refine((s) => [...s].length === 1, 'must be exactly one character'),
  level: z.enum(JLPT_LEVELS),
  strokeCount: z.number().int().positive(),
  frequency: z.number().int().positive().nullable(),
  meanings: z.object({ en: z.array(z.string()) }),
});
export type DatasetKanji = z.infer<typeof datasetKanjiSchema>;

export const kanjiDatasetFileSchema = z.object({
  datasetVersion: z.string().min(1),
  generatedAt: z.iso.datetime(),
  level: z.enum(JLPT_LEVELS),
  sources: z.array(sourceInfoSchema).min(1),
  kanji: z.array(datasetKanjiSchema),
  readings: z.array(kanjiReadingSchema),
});
export type KanjiDatasetFile = z.infer<typeof kanjiDatasetFileSchema>;

export const thaiEntrySchema = z.object({
  kanjiId: id,
  meaningsTh: z.array(z.string().min(1)),
  /** A human has checked this Thai meaning. */
  reviewed: z.boolean(),
  /** A human flagged the meaning as unclear: AMBIGUOUS THAI MEANING. */
  ambiguous: z.boolean(),
});
export type ThaiEntry = z.infer<typeof thaiEntrySchema>;

export const thaiDatasetFileSchema = z.object({
  datasetVersion: z.string().min(1),
  entries: z.array(thaiEntrySchema),
});
export type ThaiDatasetFile = z.infer<typeof thaiDatasetFileSchema>;
