import { z } from 'zod';
import { AppError, RepositoryError, ValidationError } from '../../utils/errors';

/** Runs a repository operation; unknown (e.g. IndexedDB) failures become RepositoryError. */
export async function runRepositoryOperation<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new RepositoryError(`Repository operation failed: ${operation}`, { cause });
  }
}

/** Validates untrusted or stored data; invalid data becomes ValidationError. */
export function parseRecord<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`Invalid ${what}: ${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data;
}

export function parseRecords<T>(schema: z.ZodType<T>, values: readonly unknown[], what: string): T[] {
  return values.map((value) => parseRecord(schema, value, what));
}

export function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new ValidationError(`limit must be a non-negative integer, got ${String(limit)}`);
  }
}

export function toEpochMs(date: Date, label: string): number {
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new ValidationError(`${label} is not a valid date`);
  }
  return ms;
}
