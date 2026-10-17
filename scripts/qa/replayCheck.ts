/**
 * L3a: run the replay proof on a REAL backup file (e.g. one exported from the production app on a phone).
 *   tsx scripts/qa/replayCheck.ts <backup.json>
 * Prints counts only (no learning content). Exit 0 = every card with logs replays exactly; 1 = some differ.
 */
import { readFileSync } from 'node:fs';
import { validateBackup } from '../../src/services/backup/validateBackup';
import { checkReplay } from '../../src/services/sync/replay';

const file = process.argv[2];
if (file === undefined) {
  console.error('usage: replayCheck.ts <backup.json>');
  process.exit(2);
}
const raw = JSON.parse(readFileSync(file, 'utf8')) as { formatVersion?: unknown };
const backup = validateBackup(raw);
const r = checkReplay(backup.data.reviewCards, backup.data.reviewLogs);
console.log(`backup format ${String(raw.formatVersion)} · cards ${backup.data.reviewCards.length} · logs ${backup.data.reviewLogs.length}`);
console.log(`replay matches: ${r.matching.length}`);
console.log(`replay differs: ${r.differing.length}${r.differing.length > 0 ? `  fields: ${[...new Set(r.differing.flatMap((d) => d.fields))].join(', ')}` : ''}`);
console.log(`cards without logs (kept as stored): ${r.withoutLogs.length}`);
console.log(`logs whose card is missing: ${r.orphanLogCards.length}`);
console.log(r.differing.length === 0 ? 'REPLAY CHECK: PASS' : 'REPLAY CHECK: DIFFERENCES FOUND');
process.exit(r.differing.length === 0 ? 0 : 1);
