/**
 * Mutation QA (no dependency): proves that the test suite FAILS when a locked rule is broken.
 *
 *   npm run qa:mutations
 *
 * Works on a temporary copy of the repository; the working tree is never touched. For each mutation:
 * apply one exact source edit -> run the targeted tests -> they must fail ("killed"). A mutation whose tests
 * still pass ("survived"), or whose source text is no longer found ("not applicable"), fails the run.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

interface Mutation {
  readonly id: string;
  readonly rule: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly tests: readonly string[];
}

export const MUTATIONS: readonly Mutation[] = [
  {
    id: 'due-without-mastered',
    rule: 'Due = non-NEW and due <= now (MASTERED included)',
    file: 'src/utils/dueCard.ts',
    find: "return card.state !== 'NEW' && card.due <= nowMs;",
    replace: "return card.state !== 'NEW' && card.state !== 'MASTERED' && card.due <= nowMs;",
    tests: ['tests/unit/statistics/due.test.ts', 'tests/unit/search/kanjiReviewStates.test.ts'],
  },
  {
    id: 'accuracy-denominator',
    rule: 'Accuracy = (HARD+GOOD+EASY) / completed reviews',
    file: 'src/services/statistics/accuracy.ts',
    find: 'return completed === 0 ? null : correct / completed;',
    replace: 'return completed === 0 ? null : correct / (completed + incorrect);',
    tests: ['tests/unit/statistics/calculations.test.ts'],
  },
  {
    id: 'review-write-not-atomic',
    rule: 'Card + ReviewLog are written in one transaction',
    file: 'src/repositories/indexeddb/IndexedDbReviewRepository.ts',
    find: 'await tx.objectStore(STORES.reviewCards).put(validCard);',
    replace: 'await this.db.put(STORES.reviewCards, validCard);',
    tests: ['tests/unit/repositories/recordReview.test.ts'],
  },
  {
    id: 'restore-not-atomic',
    rule: 'Import/restore is one transaction (no partial write)',
    file: 'src/repositories/indexeddb/IndexedDbBackupRepository.ts',
    find: 'for (const card of cards) await tx.objectStore(STORES.reviewCards).add(card); // add: a duplicate id fails',
    replace: 'for (const card of cards) await this.db.add(STORES.reviewCards, card);',
    tests: ['tests/unit/backup/backupRepository.test.ts'],
  },
  {
    id: 'no-dataset-compatibility',
    rule: 'A backup from another dataset version is rejected',
    file: 'src/services/backup/backupCompatibility.ts',
    find: 'if (backup.datasetVersion === null || current.datasetVersion === null || backup.datasetVersion !== current.datasetVersion) {',
    replace: 'if (false) {',
    tests: ['tests/unit/backup/validateBackup.test.ts', 'tests/unit/backup/backupRepository.test.ts'],
  },
  {
    id: 'no-algorithm-compatibility',
    rule: 'A backup from another SRS algorithm version is rejected',
    file: 'src/services/backup/backupCompatibility.ts',
    find: 'if (backup.algorithmVersion !== current.algorithmVersion) {',
    replace: 'if (false) {',
    tests: ['tests/unit/backup/validateBackup.test.ts', 'tests/unit/backup/backupRepository.test.ts'],
  },
  {
    id: 'orphan-review-log-allowed',
    rule: 'Every ReviewLog in a backup refers to a card in it',
    file: 'src/services/backup/validateBackup.ts',
    find: 'if (orphan !== undefined) throw',
    replace: 'if (false) throw',
    tests: ['tests/unit/backup/validateBackup.test.ts'],
  },
  {
    id: 'srs-graduating-interval',
    rule: 'srs-v1 intervals (graduating interval 3 days)',
    file: 'src/services/srs/constants.ts',
    find: 'export const GRADUATING_INTERVAL_DAYS = 3;',
    replace: 'export const GRADUATING_INTERVAL_DAYS = 4;',
    tests: ['tests/unit/srs/srsV1.test.ts', 'tests/unit/srs/srsV1Locked.test.ts'],
  },
  {
    id: 'project-order-ignored',
    rule: 'New cards follow the Project N5 list order 1-196',
    file: 'src/services/session/sessionEngine.ts',
    find: 'const items = await deps.newItems.getOrderedItems();',
    replace: 'const items = [...(await deps.newItems.getOrderedItems())].reverse();',
    tests: ['tests/unit/session/engine.test.ts'],
  },
  {
    id: 'thai-draft-shown',
    rule: 'Only reviewed Thai meanings are used',
    file: 'src/services/content/buildContentBundle.ts',
    find: 'entry !== undefined && entry.reviewed && !entry.ambiguous',
    replace: 'entry !== undefined && !entry.ambiguous',
    tests: ['tests/unit/dataset/pipeline.test.ts', 'tests/unit/search/searchFeature.test.tsx'],
  },
  {
    id: 'pwa-auto-update',
    rule: 'Updates wait for the user (prompt, never auto-reload)',
    file: 'pwa.config.ts',
    find: "registerType: 'prompt',",
    replace: "registerType: 'autoUpdate',",
    tests: ['tests/unit/pwa/pwa.test.tsx', 'tests/unit/architecture.test.ts'],
  },
  {
    id: 'again-reinserted',
    rule: 'AGAIN does not put the card back into the same session',
    file: 'src/features/review/useReviewSession.ts',
    find: '      if (current.index + 1 < current.cards.length) {',
    replace: "      if (rating === 'AGAIN') (current.cards as unknown as unknown[]).push(view);\n      if (current.index + 1 < current.cards.length) {",
    tests: ['tests/unit/session/reviewSession.test.tsx'],
  },
];

type Outcome = 'KILLED' | 'SURVIVED' | 'NOT APPLICABLE';

const SKIP = new Set(['node_modules', '.git', 'dist', 'test-results', 'playwright-report', 'data-sources']);

function runTests(cwd: string, tests: readonly string[]): number {
  const result = spawnSync('npx', ['vitest', 'run', ...tests, '--reporter=dot'], {
    cwd,
    encoding: 'utf8',
    timeout: 240_000,
    env: { ...process.env, CI: '1' },
  });
  return result.status ?? 1;
}

function main(): number {
  const root = process.cwd();
  const work = mkdtempSync(join(tmpdir(), 'n5-mutations-'));
  try {
    cpSync(root, work, { recursive: true, filter: (source) => !SKIP.has(relative(root, source).split(/[\\/]/)[0] ?? '') });
    symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'), 'dir');

    const allTests = [...new Set(MUTATIONS.flatMap((m) => m.tests))];
    if (runTests(work, allTests) !== 0) {
      console.error('BASELINE FAILED: the targeted tests fail without any mutation; results would be meaningless.');
      return 1;
    }

    const results: { mutation: Mutation; outcome: Outcome }[] = [];
    for (const mutation of MUTATIONS) {
      const path = join(work, mutation.file);
      const original = existsSync(path) ? readFileSync(path, 'utf8') : '';
      const occurrences = original.split(mutation.find).length - 1;
      if (occurrences !== 1) {
        results.push({ mutation, outcome: 'NOT APPLICABLE' });
        continue;
      }
      writeFileSync(path, original.replace(mutation.find, mutation.replace));
      const status = runTests(work, mutation.tests);
      writeFileSync(path, original);
      results.push({ mutation, outcome: status === 0 ? 'SURVIVED' : 'KILLED' });
      console.log(`${status === 0 ? 'SURVIVED' : 'KILLED  '}  ${mutation.id}`);
    }

    console.log('\nMutation | Rule | Expected | Result');
    for (const { mutation, outcome } of results) {
      console.log(`${mutation.id} | ${mutation.rule} | tests fail | ${outcome === 'KILLED' ? 'PASS (killed)' : `FAIL (${outcome.toLowerCase()})`}`);
    }
    const killed = results.filter((r) => r.outcome === 'KILLED').length;
    console.log(`\n${killed}/${results.length} mutations killed`);
    return killed === results.length ? 0 : 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('mutations.ts')) process.exit(main());
