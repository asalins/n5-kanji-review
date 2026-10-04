/**
 * Thai meaning audit (read-only):   npm run dataset:thai-audit [-- --json] [-- --require-complete]
 *
 * Reports coverage of data/kanji/n5.th.json against the Project N5 list. It NEVER changes a file and has no
 * way to set `reviewed`: approving a meaning (reviewed: true) is a human decision (docs/release/thai-review.md).
 * Exit 1 when the file is inconsistent; with --require-complete also when not every kanji is reviewed.
 */
import { readFileSync } from 'node:fs';
import { kanjiDatasetFileSchema, thaiDatasetFileSchema, type KanjiDatasetFile, type ThaiDatasetFile } from '../../src/services/content/datasetFiles';
import { makeKanjiId } from '../../src/utils/kanjiId';
import { levelListSchema } from './schemas';

export interface PendingThai {
  readonly position: number;
  readonly character: string;
  readonly kanjiId: string;
  /** 'no-entry' | 'empty' (no meaning yet) | 'draft' (meaning written, not reviewed) | 'ambiguous' */
  readonly status: 'no-entry' | 'empty' | 'draft' | 'ambiguous';
}

export interface ThaiAuditReport {
  readonly total: number;
  readonly hasMeaning: number;
  readonly reviewed: number;
  readonly notReviewed: number;
  readonly ambiguous: number;
  readonly missing: number;
  readonly unknownEntries: readonly string[];
  readonly duplicateEntries: readonly string[];
  /** Entries that contradict the workflow, e.g. reviewed:true without any meaning. */
  readonly inconsistent: readonly string[];
  readonly versionMatches: boolean;
  /** Pending kanji in Project N5 order (everything not shown to users yet). */
  readonly pending: readonly PendingThai[];
  /** True only when every kanji has a reviewed, non-ambiguous meaning and the file is consistent. */
  readonly complete: boolean;
}

export function auditThai(listCharacters: readonly string[], dataset: KanjiDatasetFile, thai: ThaiDatasetFile): ThaiAuditReport {
  const datasetIds = new Set(dataset.kanji.map((k) => k.id));
  const byId = new Map<string, ThaiDatasetFile['entries'][number]>();
  const duplicateEntries: string[] = [];
  for (const entry of thai.entries) {
    if (byId.has(entry.kanjiId)) duplicateEntries.push(entry.kanjiId);
    else byId.set(entry.kanjiId, entry);
  }
  const listIds = new Set(listCharacters.map(makeKanjiId));
  const unknownEntries = [...byId.keys()].filter((id) => !datasetIds.has(id) || !listIds.has(id));
  const inconsistent = [...byId.values()]
    .filter((e) => e.reviewed && e.meaningsTh.length === 0)
    .map((e) => `${e.kanjiId}: reviewed without a meaning`);

  const pending: PendingThai[] = [];
  let hasMeaning = 0;
  let reviewed = 0;
  let ambiguous = 0;
  let missing = 0;
  listCharacters.forEach((character, index) => {
    const kanjiId = makeKanjiId(character);
    const entry = byId.get(kanjiId);
    const base = { position: index + 1, character, kanjiId };
    if (entry === undefined) {
      missing += 1;
      pending.push({ ...base, status: 'no-entry' });
      return;
    }
    if (entry.meaningsTh.length > 0) hasMeaning += 1;
    if (entry.ambiguous) ambiguous += 1;
    if (entry.reviewed) reviewed += 1;
    if (entry.ambiguous) pending.push({ ...base, status: 'ambiguous' });
    else if (entry.meaningsTh.length === 0) pending.push({ ...base, status: 'empty' });
    else if (!entry.reviewed) pending.push({ ...base, status: 'draft' });
  });

  const total = listCharacters.length;
  const versionMatches = thai.datasetVersion === dataset.datasetVersion;
  const consistent = unknownEntries.length === 0 && duplicateEntries.length === 0 && inconsistent.length === 0 && versionMatches;
  return {
    total,
    hasMeaning,
    reviewed,
    notReviewed: total - missing - reviewed,
    ambiguous,
    missing,
    unknownEntries,
    duplicateEntries,
    inconsistent,
    versionMatches,
    pending,
    complete: consistent && pending.length === 0,
  };
}

function main(): number {
  const list = levelListSchema.parse(JSON.parse(readFileSync('data/lists/n5-list.json', 'utf8')));
  const dataset = kanjiDatasetFileSchema.parse(JSON.parse(readFileSync('data/kanji/n5.json', 'utf8')));
  const thai = thaiDatasetFileSchema.parse(JSON.parse(readFileSync('data/kanji/n5.th.json', 'utf8')));
  const report = auditThai(list.kanji, dataset, thai);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Thai meaning audit (data/kanji/n5.th.json)\n');
    console.log('Metric              | Count');
    console.log(`Total               | ${report.total}`);
    console.log(`Has meaning         | ${report.hasMeaning}`);
    console.log(`reviewed:true       | ${report.reviewed}`);
    console.log(`reviewed:false      | ${report.notReviewed}`);
    console.log(`ambiguous           | ${report.ambiguous}`);
    console.log(`missing (no entry)  | ${report.missing}`);
    console.log(`version matches     | ${report.versionMatches ? 'yes' : 'NO'}`);
    for (const problem of [...report.unknownEntries.map((id) => `unknown entry ${id}`), ...report.duplicateEntries.map((id) => `duplicate entry ${id}`), ...report.inconsistent]) {
      console.log(`PROBLEM: ${problem}`);
    }
    console.log(`\nPending (${report.pending.length}), shown to users only after human review:`);
    console.log(report.pending.map((p) => `${p.position}.${p.character}[${p.status}]`).join(' '));
    console.log(`\nComplete (all reviewed): ${report.complete ? 'YES' : 'NO'}`);
  }
  const consistent = report.unknownEntries.length === 0 && report.duplicateEntries.length === 0 && report.inconsistent.length === 0 && report.versionMatches;
  if (!consistent) return 1;
  if (process.argv.includes('--require-complete') && !report.complete) return 1;
  return 0;
}

if (process.argv[1]?.endsWith('thaiAudit.ts')) process.exit(main());
