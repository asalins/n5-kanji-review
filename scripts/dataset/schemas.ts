import { z } from 'zod';
import { JLPT_LEVELS } from '../../src/types/common';
import { sourceInfoSchema } from '../../src/services/content/datasetFiles';

/** data/lists/n5-list.json: the project's source-of-truth list of kanji for a level. */
export const levelListSchema = z.object({
  version: z.string().min(1),
  level: z.enum(JLPT_LEVELS),
  /** Where this list comes from. Must be non-empty and approved by the project before use. */
  sources: z.array(sourceInfoSchema),
  kanji: z.array(z.string().refine((s) => [...s].length === 1, 'must be exactly one character')),
});
export type LevelList = z.infer<typeof levelListSchema>;
