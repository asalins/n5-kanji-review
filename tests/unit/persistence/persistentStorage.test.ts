import { describe, expect, it, vi } from 'vitest';
import { readPersistentStorage, requestPersistentStorage } from '../../../src/services/persistence/persistentStorage';

describe('persistent storage request (never throws, never touches learning data)', () => {
  it('asks the browser once when not yet persistent and reports the answer', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    expect(await requestPersistentStorage({ persisted: () => Promise.resolve(false), persist })).toBe('persistent');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await requestPersistentStorage({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) })).toBe('not-persistent');
  });

  it('does not ask again when the storage is already persistent', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    expect(await requestPersistentStorage({ persisted: () => Promise.resolve(true), persist })).toBe('persistent');
    expect(persist).not.toHaveBeenCalled();
  });

  it('reports unsupported browsers and errors instead of throwing', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unsupported');
    expect(await requestPersistentStorage({})).toBe('unsupported');
    expect(await requestPersistentStorage({ persist: () => Promise.reject(new Error('blocked')) })).toBe('unknown');
    expect(await readPersistentStorage(undefined)).toBe('unsupported');
    expect(await readPersistentStorage({ persisted: () => Promise.reject(new Error('x')) })).toBe('unknown');
    expect(await readPersistentStorage({ persisted: () => Promise.resolve(true) })).toBe('persistent');
    expect(await readPersistentStorage({ persisted: () => Promise.resolve(false) })).toBe('not-persistent');
  });
});
