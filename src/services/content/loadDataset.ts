import { z } from 'zod';
import type { ContentWriter, KanjiRepository } from '../../repositories/interfaces';
import { ValidationError } from '../../utils/errors';
import { buildContentBundle } from './buildContentBundle';
import { kanjiDatasetFileSchema, thaiDatasetFileSchema } from './datasetFiles';
import { checkIntegrity } from './integrity';

export interface LoadDatasetDeps {
  readonly writer: ContentWriter;
  readonly reader: Pick<KanjiRepository, 'getDatasetVersion'>;
  readonly now: () => number;
}

export interface LoadDatasetResult {
  readonly status: 'loaded' | 'up-to-date';
  readonly datasetVersion: string;
  readonly kanjiCount: number;
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`Invalid ${what}: ${z.prettifyError(result.error)}`, { cause: result.error });
  }
  return result.data;
}

/**
 * Validates the dataset files and, if they are a different version than what is stored, REPLACES
 * the content stores (no stale records). User data is never touched. The dataset file's
 * `datasetVersion` is the single source of truth for the content version.
 */
export async function loadDatasetContent(
  deps: LoadDatasetDeps,
  rawDataset: unknown,
  rawThai: unknown,
): Promise<LoadDatasetResult> {
  const dataset = parseOrThrow(kanjiDatasetFileSchema, rawDataset, 'kanji dataset file');
  const thai = parseOrThrow(thaiDatasetFileSchema, rawThai, 'Thai dataset file');

  if (thai.datasetVersion !== dataset.datasetVersion) {
    throw new ValidationError(
      `Dataset version mismatch: kanji=${dataset.datasetVersion}, thai=${thai.datasetVersion}`,
    );
  }
  const issues = checkIntegrity(dataset.kanji, dataset.readings);
  if (issues.length > 0) {
    const summary = issues.slice(0, 5).map((i) => `${i.code}:${i.subject}`).join(', ');
    throw new ValidationError(`Dataset failed integrity checks (${issues.length}): ${summary}`);
  }

  const current = await deps.reader.getDatasetVersion();
  if (current === dataset.datasetVersion) {
    return { status: 'up-to-date', datasetVersion: current, kanjiCount: dataset.kanji.length };
  }

  const { bundle } = buildContentBundle(dataset, thai);
  await deps.writer.replaceContent(bundle, {
    datasetVersion: dataset.datasetVersion,
    loadedAt: deps.now(),
  });
  return { status: 'loaded', datasetVersion: dataset.datasetVersion, kanjiCount: dataset.kanji.length };
}
