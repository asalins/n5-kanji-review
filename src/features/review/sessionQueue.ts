import type { Kanji } from '../../types/entities';

export const STUDY_LEVEL = 'N5';
export const DEFAULT_SESSION_SIZE = 10;

/** Small deterministic PRNG (mulberry32) so a session can be reproduced from its seed. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks up to `size` DIFFERENT kanji (no repeats within a session). Input is sorted by id first, so the
 * result depends only on the seed, not on the order the repository returned items in.
 * Scheduling-based selection belongs to Phase 5/6.
 */
export function selectSessionKanji(all: readonly Kanji[], size: number, seed: number): Kanji[] {
  const pool = [...all].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const random = createRandom(seed);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = pool[i] as Kanji;
    pool[i] = pool[j] as Kanji;
    pool[j] = a;
  }
  return pool.slice(0, Math.max(0, size));
}
