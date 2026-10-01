/** Shared error pattern: every layer throws one of these, with the original error in `cause`. */
export class AppError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class RepositoryError extends AppError {}
export class ValidationError extends AppError {}
export class ImportError extends AppError {}
export class StorageError extends AppError {}
