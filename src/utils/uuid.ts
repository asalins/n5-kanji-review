/**
 * Random UUID v4 for ids that must not collide across devices (ReviewLog ids, the installation id).
 * Uses crypto.randomUUID when present, otherwise builds a v4 UUID from crypto.getRandomValues
 * (randomUUID is missing outside secure contexts, e.g. plain-http LAN testing, and in some older browsers).
 * Never falls back to Math.random: without a cryptographic source it throws instead of risking collisions.
 */
export interface RandomSource {
  readonly randomUUID?: () => string;
  readonly getRandomValues?: (array: Uint8Array<ArrayBuffer>) => Uint8Array;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV4(value: string): boolean {
  return UUID_V4.test(value);
}

export function newUuid(source: RandomSource | null = (globalThis.crypto as RandomSource | undefined) ?? null): string {
  if (typeof source?.randomUUID === 'function') {
    const value = source.randomUUID().toLowerCase();
    if (isUuidV4(value)) return value;
  }
  if (typeof source?.getRandomValues === 'function') {
    const bytes = source.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('No cryptographic random source available for a UUID');
}

/** ReviewLog id for every review recorded from schema v3 on. Old logs keep their `${cardId}#${n}` ids. */
export function newReviewLogId(source?: RandomSource): string {
  return `log:${source === undefined ? newUuid() : newUuid(source)}`;
}
