/**
 * Build-time CLI: npm run dataset:build [-- --dataset-version n5-YYYY.MM.DD]
 * Inputs : data/lists/n5-list.json, data-sources/kanjidic2/kanjidic2.xml, data/kanji/n5.th.json (optional)
 * Outputs: data/kanji/n5.json, data/kanji/n5.report.json, data/kanji/n5.th.json (skeleton, only if absent)
 * Exit codes: 0 ok, 1 blocking data problems (report written), 2 required input missing.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import { thaiDatasetFileSchema } from '../../src/services/content/datasetFiles';
import { buildDataset, buildThaiSkeleton } from './buildDataset';
import { parseKanjidic2 } from './kanjidic2';
import { alignThaiVersion } from './thaiVersion';
import { levelListSchema } from './schemas';

const LIST_PATH = 'data/lists/n5-list.json';
const SOURCE_PATH = 'data-sources/kanjidic2/kanjidic2.xml';
const DATASET_PATH = 'data/kanji/n5.json';
const THAI_PATH = 'data/kanji/n5.th.json';
const REPORT_PATH = 'data/kanji/n5.report.json';
const KANJIDIC_URL = 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project';
const KANJIDIC_LICENSE = 'CC BY-SA 4.0 (EDRDG General Dictionary Licence Statement)';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<number> {
  const list = levelListSchema.parse(JSON.parse(await readFile(LIST_PATH, 'utf8')));
  if (list.kanji.length === 0 || list.sources.length === 0) {
    console.error('N5 LIST SOURCE REQUIRED: data/lists/n5-list.json has no approved list/source yet.');
    return 2;
  }
  if (!(await exists(SOURCE_PATH))) {
    console.error(`SOURCE FILE REQUIRED: place the official KANJIDIC2 XML at ${SOURCE_PATH} (see DATA_SOURCES.md).`);
    return 2;
  }

  const kanjidic = parseKanjidic2(await readFile(SOURCE_PATH, 'utf8'));
  const generatedAt = new Date().toISOString();
  const datasetVersion = argValue('--dataset-version') ?? `${list.level.toLowerCase()}-${generatedAt.slice(0, 10).replaceAll('-', '.')}`;
  const existingThai = (await exists(THAI_PATH))
    ? thaiDatasetFileSchema.parse(JSON.parse(await readFile(THAI_PATH, 'utf8')))
    : null;
  // A new dataset version carries the Thai file along: same entries and reviewed flags, new version only.
  const thai = existingThai === null ? null : alignThaiVersion(existingThai, datasetVersion);

  const { dataset, report } = buildDataset({
    list,
    kanjidic,
    kanjidicSource: {
      name: 'KANJIDIC2',
      version: kanjidic.header.databaseVersion,
      date: kanjidic.header.dateOfCreation,
      officialUrl: KANJIDIC_URL,
      license: KANJIDIC_LICENSE,
    },
    thai,
    datasetVersion,
    generatedAt,
  });

  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  if (dataset === null) {
    console.error(`Dataset NOT written. Blockers: ${report.blockers.join('; ')}. See ${REPORT_PATH}`);
    return 1;
  }
  await writeFile(DATASET_PATH, `${JSON.stringify(dataset, null, 2)}\n`);
  if (thai === null) {
    await writeFile(THAI_PATH, `${JSON.stringify(buildThaiSkeleton(dataset), null, 2)}\n`);
  } else if (existingThai !== null && existingThai.datasetVersion !== datasetVersion) {
    await writeFile(THAI_PATH, `${JSON.stringify(thai, null, 2)}\n`);
    console.log(`Updated ${THAI_PATH} to ${datasetVersion} (entries and reviewed flags unchanged).`);
  }
  console.log(`Wrote ${DATASET_PATH}: ${report.valid} kanji, ${report.missingThai.length} without Thai.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
