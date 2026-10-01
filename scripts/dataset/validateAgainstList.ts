import type { KanjiDatasetFile } from '../../src/services/content/datasetFiles';
import type { LevelList } from './schemas';

export interface ListCheck {
  /** Dataset records whose character is not in the project list. */
  readonly notInList: readonly string[];
  /** List entries that have no dataset record. */
  readonly listWithoutRecord: readonly string[];
}

/** N5 integrity: the dataset and the project list must describe exactly the same characters. */
export function checkAgainstList(dataset: KanjiDatasetFile, list: LevelList): ListCheck {
  const listed = new Set(list.kanji);
  const present = new Set(dataset.kanji.map((k) => k.character));
  return {
    notInList: dataset.kanji.filter((k) => !listed.has(k.character)).map((k) => k.character),
    listWithoutRecord: [...listed].filter((c) => !present.has(c)),
  };
}
