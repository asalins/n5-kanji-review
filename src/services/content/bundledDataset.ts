import { loadDatasetContent, type LoadDatasetDeps, type LoadDatasetResult } from './loadDataset';

/**
 * Loads the application dataset that ships with the app (data/kanji) into the content stores.
 * The files are imported lazily so they are a separate chunk, and only this service reads them.
 */
export async function loadBundledDataset(deps: LoadDatasetDeps): Promise<LoadDatasetResult> {
  const [dataset, thai] = await Promise.all([
    import('../../../data/kanji/n5.json'),
    import('../../../data/kanji/n5.th.json'),
  ]);
  return loadDatasetContent(deps, dataset.default, thai.default);
}
