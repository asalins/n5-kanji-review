import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalEvent, mergeReviewLogs } from '../../../src/services/sync/logCollision';
import { reviewLogSchema } from '../../../src/types/schemas';
import type { ReviewLog } from '../../../src/types/entities';
import { sha256Hex } from '../../../src/utils/sha256';
import { makeLog } from '../../helpers/fixtures';

const CARD = 'kanji:kanji:U+6C34:A';
const legacy = (n: number, over: Partial<ReviewLog> = {}): ReviewLog =>
  makeLog({ id: `${CARD}#${n}`, cardId: CARD, reviewedAt: 1_800_000_000_000 + n * 60_000, ...over });
const ids = (logs: readonly ReviewLog[]) => logs.map((l) => l.id);
const merge = (a: readonly ReviewLog[], b: readonly ReviewLog[]) => mergeReviewLogs(a, b).logs;

describe('sha256Hex (pure, synchronous)', () => {
  it.each(['', 'abc', 'ทบทวน 水 火 山', 'x'.repeat(1_000), JSON.stringify(['a', 1, null])])('matches node:crypto for %j', (text) => {
    expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});

describe('ReviewLog collision resolver', () => {
  it('canonical event = the 8 event fields only; id and originalId are metadata', () => {
    const a = legacy(1);
    expect(canonicalEvent(a)).toBe(canonicalEvent({ ...a, id: 'other', originalId: null }));
    for (const field of ['cardId', 'rating', 'reviewedAt', 'durationMs', 'stateBefore', 'stateAfter', 'datasetVersion', 'deviceId'] as const) {
      const changed = { ...a, [field]: field === 'reviewedAt' || field === 'durationMs' ? 7 : field === 'rating' ? 'EASY' : field.startsWith('state') ? 'MASTERED' : 'changed' } as ReviewLog;
      expect(canonicalEvent(changed), field).not.toBe(canonicalEvent(a));
    }
  });

  it('same id + same event = the same review: kept once', () => {
    const result = mergeReviewLogs([legacy(1)], [legacy(1)]);
    expect(result.logs).toEqual([legacy(1)]);
    expect(result.duplicatesMerged).toBe(1);
    expect(result.renamed).toEqual([]);
  });

  it('same id + different event: both kept; one keeps the id, the other gets originalId~hash16 and originalId', () => {
    const a = legacy(1, { deviceId: 'device-a' });
    const b = legacy(1, { deviceId: 'device-b', rating: 'AGAIN' });
    const result = mergeReviewLogs([a], [b]);
    expect(result.logs).toHaveLength(2);
    const kept = result.logs.find((l) => l.id === a.id)!;
    const moved = result.logs.find((l) => l.id !== a.id)!;
    expect(kept.originalId).toBeNull();
    expect(moved.originalId).toBe(a.id);
    expect(moved.id).toBe(`${a.id}~${sha256Hex(canonicalEvent(moved)).slice(0, 16)}`);
    // nothing about the events changed
    expect([kept, moved].map(canonicalEvent).sort()).toEqual([a, b].map(canonicalEvent).sort());
    for (const log of result.logs) expect(reviewLogSchema.parse(log)).toEqual(log);
  });

  it('is order independent: A then B equals B then A (and every permutation of three sources)', () => {
    const local = [legacy(1, { deviceId: 'a' }), legacy(2, { deviceId: 'a' })];
    const phone = [legacy(1, { deviceId: 'b', durationMs: 9 }), legacy(2, { deviceId: 'a' }), legacy(3, { deviceId: 'b' })];
    const tablet = [legacy(1, { deviceId: 'c', rating: 'HARD' }), makeLog({ id: 'log:7f1c', cardId: CARD, deviceId: 'c' })];
    const reference = merge(merge(local, phone), tablet);
    for (const [x, y, z] of [[local, tablet, phone], [phone, local, tablet], [phone, tablet, local], [tablet, local, phone], [tablet, phone, local]]) {
      expect(merge(merge(x!, y!), z!)).toEqual(reference);
    }
    expect(merge(local, phone)).toEqual(merge(phone, local));
    expect(reference).toHaveLength(6); // #1 in 3 versions, #2 once (same event on two sources), #3, log:7f1c
  });

  it('re-importing a file that was already merged changes nothing (no id drifts on repeat)', () => {
    const file = [legacy(1, { deviceId: 'b', rating: 'AGAIN' }), legacy(2, { deviceId: 'b' })];
    const once = merge([legacy(1, { deviceId: 'a' })], file);
    expect(merge(once, file)).toEqual(once);
    expect(merge(merge(once, file), file)).toEqual(once);
    expect(merge(once, once)).toEqual(once);
  });

  it('a collision-resolved record that already exists is recognised by originalId when the original file comes again', () => {
    const a = legacy(1, { deviceId: 'a' });
    const b = legacy(1, { deviceId: 'b', rating: 'AGAIN' });
    const resolved = merge([a], [b]);
    const movedBefore = resolved.find((l) => l.originalId !== null)!;
    // the other device sends its ORIGINAL (unrenamed) log again
    const again = merge(resolved, [b]);
    expect(again).toEqual(resolved);
    expect(again.find((l) => l.originalId !== null)!.id).toBe(movedBefore.id);
  });

  it('a renamed id that is already taken by a real log (or a hash collision) moves to a longer, still deterministic id', () => {
    const a = legacy(1, { deviceId: 'a' });
    const b = legacy(1, { deviceId: 'b', rating: 'AGAIN' });
    const plain = merge([a], [b]).find((l) => l.originalId !== null)!;
    // a different review that happens to own exactly that id
    const squatter = makeLog({ id: plain.id, cardId: CARD, deviceId: 'z', reviewedAt: 5 });
    const result = merge([a, squatter], [b]);
    expect(result).toHaveLength(3);
    expect(result.find((l) => l.id === plain.id)).toEqual(squatter); // the real owner keeps its id
    const moved = result.find((l) => l.originalId === a.id)!;
    expect(canonicalEvent(moved)).toBe(canonicalEvent(plain)); // the same review is the one renamed
    expect(moved.id).toBe(`${a.id}~${sha256Hex(canonicalEvent(moved)).slice(0, 32)}`);
    expect(merge([b], [squatter, a])).toEqual(result);
    expect(new Set(ids(result)).size).toBe(result.length);
  });

  it('different ids are never merged, even with identical events (no history dropped on a guess)', () => {
    const a = makeLog({ id: 'log:aaa', cardId: CARD });
    const b = makeLog({ id: 'log:bbb', cardId: CARD });
    expect(ids(merge([a], [b]))).toEqual(['log:aaa', 'log:bbb']);
  });

  it('many versions of one id: all kept, all ids unique and valid', () => {
    const versions = ['AGAIN', 'HARD', 'GOOD', 'EASY'].map((rating, i) => legacy(1, { rating: rating as ReviewLog['rating'], deviceId: `d${i}` }));
    const result = mergeReviewLogs(versions.slice(0, 2), versions.slice(2));
    expect(result.logs).toHaveLength(4);
    expect(new Set(ids(result.logs)).size).toBe(4);
    expect(result.renamed).toHaveLength(3);
    expect(result.logs.filter((l) => l.originalId === null)).toHaveLength(1);
    for (const log of result.logs) expect(reviewLogSchema.safeParse(log).success).toBe(true);
  });
});
