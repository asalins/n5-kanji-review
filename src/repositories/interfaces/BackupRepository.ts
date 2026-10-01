/** Payload and preview shapes are defined in Phase 9. */
export interface BackupPayload {
  readonly version: number;
}
export interface ImportPreview {
  readonly version: number;
}

export interface BackupRepository {
  exportAll(): Promise<BackupPayload>;
  /** Input is untrusted: implementations must validate (Zod) before returning a preview. */
  previewImport(raw: unknown): Promise<ImportPreview>;
  importAll(raw: unknown): Promise<void>;
  resetAll(): Promise<void>;
}
