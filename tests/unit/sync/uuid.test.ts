import { describe, expect, it } from 'vitest';
import { isUuidV4, newReviewLogId, newUuid } from '../../../src/utils/uuid';

describe('UUID v4 for log ids and the installation id', () => {
  it('uses crypto.randomUUID when it exists', () => {
    expect(newUuid({ randomUUID: () => '0B5F2C9E-7A41-4D3B-9C2E-5F1A8B7C6D4E' })).toBe('0b5f2c9e-7a41-4d3b-9c2e-5f1a8b7c6d4e');
  });
  it('falls back to crypto.getRandomValues (randomUUID is missing outside secure contexts) and still yields valid, unique v4', () => {
    const source = { getRandomValues: (a: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(a) };
    const values = Array.from({ length: 500 }, () => newUuid(source));
    expect(values.every(isUuidV4)).toBe(true);
    expect(new Set(values).size).toBe(500);
  });
  it('sets the version and variant bits even from all-zero / all-one random bytes', () => {
    expect(newUuid({ getRandomValues: (a) => a.fill(0) })).toBe('00000000-0000-4000-8000-000000000000');
    expect(newUuid({ getRandomValues: (a) => a.fill(255) })).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
  it('ignores a malformed randomUUID result and uses getRandomValues', () => {
    expect(isUuidV4(newUuid({ randomUUID: () => 'nope', getRandomValues: (a) => a.fill(7) }))).toBe(true);
  });
  it('never falls back to Math.random: no cryptographic source -> it throws', () => {
    expect(() => newUuid({})).toThrow(/cryptographic/);
    expect(() => newUuid(null)).toThrow(/cryptographic/);
  });
  it('the platform default works here and log ids are log:<uuid>', () => {
    expect(newReviewLogId()).toMatch(/^log:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
