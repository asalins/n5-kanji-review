import { describe, expect, it } from 'vitest';
import { assertNever } from '../../src/utils/assertNever';
import { AppError, StorageError } from '../../src/utils/errors';
import { selectPendingMigrations, type Migration } from '../../src/services/storage/database';

describe('assertNever', () => {
  it('throws on unexpected values', () => {
    expect(() => assertNever('x' as never)).toThrow('Unexpected value: x');
  });
});

describe('errors', () => {
  it('keeps subclass name and cause', () => {
    const cause = new Error('root');
    const err = new StorageError('failed', { cause });
    expect(err).toBeInstanceOf(AppError);
    expect(err.name).toBe('StorageError');
    expect(err.cause).toBe(cause);
  });
});

describe('selectPendingMigrations', () => {
  const noop = () => undefined;
  const all: Migration[] = [
    { version: 3, description: 'third', migrate: noop },
    { version: 1, description: 'first', migrate: noop },
    { version: 2, description: 'second', migrate: noop },
  ];
  it('returns only newer migrations in ascending order', () => {
    expect(selectPendingMigrations(all, 1, 3).map((m) => m.version)).toEqual([2, 3]);
  });
  it('returns everything for a fresh database', () => {
    expect(selectPendingMigrations(all, 0, 3).map((m) => m.version)).toEqual([1, 2, 3]);
  });
});
