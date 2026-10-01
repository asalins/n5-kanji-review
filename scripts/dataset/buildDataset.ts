import { buildContentBundle } from '../../src/services/content/buildContentBundle';
import {
  kanjiDatasetFileSchema,
  type DatasetKanji,
  type KanjiDatasetFile,
  type SourceInfo,
  type ThaiDatasetFile,
} from '../../src/services/content/datasetFiles';
import { checkIntegrity } from '../../src/services/content/integrity';
import type { KanjiReading } from '../../src/types/entities';
import { makeKanjiId } from '../../src/utils/kanjiId';
import type { ParsedKanjidic } from './kanjidic2';
import { endsWithSokuon, kanaToRomaji } from './romaji';
import type { LevelList } from './schemas';
import { checkAgainstList } from './validateAgainstList';

export interface BuildInput {
  readonly list: LevelList;
  readonly kanjidic: ParsedKanjidic;
  readonly kanjidicSource: SourceInfo;
  /** Existing Thai file, or null when none exists yet (everything is then reported missing). */
  readonly thai: ThaiDatasetFile | null;
  readonly datasetVersion: string;
  readonly generatedAt: string;
}

export interface DatasetReport {
  readonly datasetVersion: string;
  readonly generatedAt: string;
  readonly total: number;
  readonly valid: number;
  readonly missing: readonly string[];
  readonly duplicate: readonly string[];
  readonly ambiguous: readonly string[];
  readonly missingThai: readonly string[];
  readonly missingReading: readonly string[];
  readonly missingStrokeCount: readonly string[];
  readonly missingEnglishMeaning: readonly string[];
  readonly unconvertibleReading: readonly string[];
  readonly integrity: readonly { code: string; subject: string }[];
  readonly unknownThai: readonly string[];
  /** Problems that prevent writing the dataset. Thai gaps alone are warnings, not blockers. */
  readonly blockers: readonly string[];
}

export interface BuildOutput {
  readonly dataset: KanjiDatasetFile | null;
  readonly report: DatasetReport;
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

/** Pure pipeline step: filter by the project list, normalize, validate, report. Never guesses. */
export function buildDataset(input: BuildInput): BuildOutput {
  const { list, kanjidic } = input;
  const duplicate = [
    ...findDuplicates(list.kanji).map((c) => `list:${c}`),
    ...findDuplicates(kanjidic.characters.map((c) => c.literal)).map((c) => `source:${c}`),
  ];
  const duplicateSourceChars = new Set(
    duplicate.filter((d) => d.startsWith('source:')).map((d) => d.slice('source:'.length)),
  );

  const sourceByChar = new Map(kanjidic.characters.map((c) => [c.literal, c]));
  const listChars = [...new Set(list.kanji)];

  const missing: string[] = [];
  const missingReading: string[] = [];
  const missingStrokeCount: string[] = [];
  const missingEnglishMeaning: string[] = [];
  const unconvertibleReading: string[] = [];
  const ambiguous: string[] = [];
  const kanji: DatasetKanji[] = [];
  const readings: KanjiReading[] = [];

  for (const character of listChars) {
    const raw = sourceByChar.get(character);
    if (raw === undefined) {
      missing.push(character);
      continue;
    }
    if (duplicateSourceChars.has(character)) continue; // reported as duplicate, not resolved by guessing

    const [stroke, ...otherStrokes] = raw.strokeCounts;
    if (stroke === undefined) {
      missingStrokeCount.push(character);
      continue;
    }
    // KANJIDIC2 lists the accepted count first and common miscounts after it. Surface the conflict.
    if (otherStrokes.length > 0) ambiguous.push(`${character}:strokeCount`);

    const id = makeKanjiId(character);
    const kanjiReadings: KanjiReading[] = [];
    let convertible = true;
    for (const [type, kanaList] of [['on', raw.onReadings], ['kun', raw.kunReadings]] as const) {
      for (const kana of kanaList) {
        const romaji = kanaToRomaji(kana);
        if (romaji === null) {
          convertible = false;
          unconvertibleReading.push(`${character}:${kana}`);
        } else {
          if (endsWithSokuon(kana)) ambiguous.push(`${character}:${kana}:romaji`);
          kanjiReadings.push({ kanjiId: id, type, kana, romaji });
        }
      }
    }
    if (raw.onReadings.length + raw.kunReadings.length === 0) {
      missingReading.push(character);
      continue;
    }
    if (!convertible) continue;
    if (raw.meaningsEn.length === 0) missingEnglishMeaning.push(character);

    kanji.push({
      id,
      character,
      level: list.level,
      strokeCount: stroke,
      frequency: raw.frequency,
      meanings: { en: [...raw.meaningsEn] },
    });
    readings.push(...kanjiReadings);
  }

  const integrity = checkIntegrity(kanji, readings);

  const candidate: KanjiDatasetFile = {
    datasetVersion: input.datasetVersion,
    generatedAt: input.generatedAt,
    level: list.level,
    sources: [input.kanjidicSource, ...list.sources],
    kanji,
    readings,
  };
  const schemaCheck = kanjiDatasetFileSchema.safeParse(candidate);

  const thai: ThaiDatasetFile = input.thai ?? { datasetVersion: input.datasetVersion, entries: [] };
  const merge = buildContentBundle(candidate, thai);
  const listCheck = checkAgainstList(candidate, list);

  const blockers: string[] = [];
  if (list.kanji.length === 0) blockers.push('N5 LIST SOURCE REQUIRED: the list is empty');
  if (list.sources.length === 0) blockers.push('N5 LIST SOURCE REQUIRED: the list names no source');
  if (!schemaCheck.success) blockers.push('dataset failed schema validation');
  if (thai.datasetVersion !== input.datasetVersion) blockers.push('Thai file datasetVersion does not match');
  for (const [name, items] of [
    ['missing from source', missing],
    ['duplicate', duplicate],
    ['missing reading', missingReading],
    ['missing stroke count', missingStrokeCount],
    ['unconvertible reading', unconvertibleReading],
    ['integrity issue', integrity],
    ['record not in list', listCheck.notInList],
    ['unknown Thai entry', merge.thai.unknownThai],
    ['duplicate Thai entry', merge.thai.duplicateThai],
  ] as const) {
    if (items.length > 0) blockers.push(`${items.length} ${name}`);
  }

  const report: DatasetReport = {
    datasetVersion: input.datasetVersion,
    generatedAt: input.generatedAt,
    total: listChars.length,
    valid: blockers.length === 0 ? kanji.length : 0,
    missing,
    duplicate,
    ambiguous: [...ambiguous, ...merge.thai.ambiguousThai.map((id) => `${id}:thai`)],
    missingThai: merge.thai.missingThai,
    missingReading,
    missingStrokeCount,
    missingEnglishMeaning,
    unconvertibleReading,
    integrity: integrity.map((i) => ({ code: i.code, subject: i.subject })),
    unknownThai: merge.thai.unknownThai,
    blockers,
  };
  return { dataset: blockers.length === 0 ? candidate : null, report };
}

/** Skeleton for translators: one empty, unreviewed entry per kanji. Never overwrites a real file. */
export function buildThaiSkeleton(dataset: KanjiDatasetFile): ThaiDatasetFile {
  return {
    datasetVersion: dataset.datasetVersion,
    entries: dataset.kanji.map((k) => ({ kanjiId: k.id, meaningsTh: [], reviewed: false, ambiguous: false })),
  };
}
