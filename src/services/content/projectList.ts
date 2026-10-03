import { z } from 'zod';
import type { NewItemSource } from '../session/types';
import { ValidationError } from '../../utils/errors';
import { makeKanjiId } from '../../utils/kanjiId';

const projectListSchema = z.object({
  level: z.literal('N5'),
  kanji: z.array(z.string().refine((s) => [...s].length === 1)).min(1),
});

/** Turns the parsed list file into ordered kanji items, preserving the Project Owner's order. */
export function itemsFromProjectList(raw: unknown): ReturnType<NewItemSource['getOrderedItems']> {
  const parsed = projectListSchema.safeParse(raw);
  if (!parsed.success) {
    return Promise.reject(new ValidationError('Invalid project N5 list', { cause: parsed.error }));
  }
  return Promise.resolve(parsed.data.kanji.map((character) => ({ itemType: 'kanji' as const, itemId: makeKanjiId(character) })));
}

/** The Project N5 Kanji List (data/lists/n5-list.json) as the source of NEW cards. Read only by this service. */
export function createProjectListSource(): NewItemSource {
  return {
    async getOrderedItems() {
      const list = await import('../../../data/lists/n5-list.json');
      return itemsFromProjectList(list.default);
    },
  };
}
