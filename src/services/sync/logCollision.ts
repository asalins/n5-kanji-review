import type { ReviewLog } from '../../types/entities';
import { sha256Hex } from '../../utils/sha256';

/**
 * ReviewLog id-collision resolver (L1-3). Pure and synchronous; not wired to any UI or sync engine yet (L3).
 *
 * Event identity — the fields that say WHAT happened, compared canonically:
 *   cardId, rating, reviewedAt, durationMs, stateBefore, stateAfter, datasetVersion, deviceId
 * Collision metadata — never part of the event: id, originalId.
 *
 * rootId(log) = originalId ?? id  (the id the log was first recorded with).
 *
 * mergeReviewLogs(existing, incoming) depends only on the SET of (rootId, event) pairs in its input:
 *  1. Same rootId and same event  -> the same review: kept once (whichever copy; they are identical events).
 *  2. Same rootId, different events -> all are kept. Sorted by canonical event text, the first keeps rootId
 *     (originalId null); each other gets id = `${rootId}~${sha256(canonical event)[0..16)}`, originalId = rootId.
 *  3. Different rootIds are never merged, even if their events look identical (no history is dropped on a guess).
 *  4. Uniqueness: every kept rootId is reserved first; a renamed id that is already taken (a hash collision, or a
 *     real log whose id happens to equal it) retries with 32 hex, then 64 hex, then `~<64 hex>-2`, `-3`, ...
 *     Renamed ids are assigned in sorted (rootId, event) order, so the result is still deterministic.
 * Consequences: merge(A then B) === merge(B then A); re-importing a file already merged changes nothing
 * (a renamed log carries its rootId in originalId, so it is recognised and gets the same id again).
 */

export interface LogMergeResult {
  /** Every distinct review, sorted by id. */
  readonly logs: readonly ReviewLog[];
  /** Logs whose id differs from rootId in the result: { rootId, id }. */
  readonly renamed: readonly { readonly rootId: string; readonly id: string }[];
  /** Input copies that were the same review as another one (rule 1). */
  readonly duplicatesMerged: number;
}

const rootIdOf = (log: ReviewLog): string => log.originalId ?? log.id;

/** Fixed field order; JSON gives one unambiguous text per event (strings escaped, null explicit). */
export function canonicalEvent(log: ReviewLog): string {
  return JSON.stringify([
    log.cardId,
    log.rating,
    log.reviewedAt,
    log.durationMs,
    log.stateBefore,
    log.stateAfter,
    log.datasetVersion,
    log.deviceId,
  ]);
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function renamedIdCandidates(rootId: string, hash: string): Iterable<string> {
  return {
    *[Symbol.iterator]() {
      yield `${rootId}~${hash.slice(0, 16)}`;
      yield `${rootId}~${hash.slice(0, 32)}`;
      yield `${rootId}~${hash}`;
      for (let n = 2; ; n += 1) yield `${rootId}~${hash}-${n}`;
    },
  };
}

export function mergeReviewLogs(existing: readonly ReviewLog[], incoming: readonly ReviewLog[]): LogMergeResult {
  // rule 1: one entry per (rootId, event)
  const byRoot = new Map<string, Map<string, ReviewLog>>();
  let total = 0;
  for (const log of [...existing, ...incoming]) {
    total += 1;
    const rootId = rootIdOf(log);
    const events = byRoot.get(rootId) ?? new Map<string, ReviewLog>();
    const key = canonicalEvent(log);
    if (!events.has(key)) events.set(key, log);
    byRoot.set(rootId, events);
  }

  const roots = [...byRoot.keys()].sort(compare);
  const taken = new Set<string>(roots); // rule 4: every kept rootId is reserved before any rename
  const out: ReviewLog[] = [];
  const renamed: { rootId: string; id: string }[] = [];
  let distinct = 0;

  for (const rootId of roots) {
    const events = [...byRoot.get(rootId)!.entries()].sort(([a], [b]) => compare(a, b));
    distinct += events.length;
    events.forEach(([key, log], index) => {
      if (index === 0) {
        out.push({ ...log, id: rootId, originalId: null });
        return;
      }
      const hash = sha256Hex(key);
      let id = '';
      for (const candidate of renamedIdCandidates(rootId, hash)) {
        if (!taken.has(candidate)) {
          id = candidate;
          break;
        }
      }
      taken.add(id);
      out.push({ ...log, id, originalId: rootId });
      renamed.push({ rootId, id });
    });
  }

  return { logs: out.sort((a, b) => compare(a.id, b.id)), renamed, duplicatesMerged: total - distinct };
}
