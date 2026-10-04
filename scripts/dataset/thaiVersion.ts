import type { ThaiDatasetFile } from '../../src/services/content/datasetFiles';

/**
 * When the kanji dataset gets a new version, the Thai file must carry the same version (the app refuses to load
 * mismatched files). This keeps every entry exactly as it is, `reviewed` flags included; only the version changes.
 */
export function alignThaiVersion(thai: ThaiDatasetFile, datasetVersion: string): ThaiDatasetFile {
  return { ...thai, datasetVersion };
}
