import { ImportError, RepositoryError, StorageError, ValidationError } from './errors';

/**
 * The browser holds this app's database at a newer version than this build knows (IndexedDB `VersionError`): it was
 * written by a newer build of the app. The data is intact; a newer build opens it. Nothing else is assumed (R-1, D3).
 */
export function isNewerDatabaseError(error: unknown): boolean {
  if (!(error instanceof StorageError)) return false;
  const cause: unknown = error.cause;
  return typeof cause === 'object' && cause !== null && (cause as { name?: unknown }).name === 'VersionError';
}

/** Safe, user-facing text for an error. Never exposes database internals or raw exception text. */
export function toUserMessage(error: unknown): string {
  if (isNewerDatabaseError(error)) {
    // Never suggest clearing site data here: that would delete the learning data the newer version wrote.
    return (
      'ข้อมูลในเครื่องนี้สร้างโดยแอปเวอร์ชันที่ใหม่กว่า ข้อมูลของคุณยังอยู่ · ปิดแอปนี้ทุกแท็บและทุกหน้าต่าง แล้วเปิดใหม่เพื่อโหลดเวอร์ชันล่าสุด · อย่าล้างข้อมูลเว็บไซต์ · ' +
      'This browser holds data from a newer version of the app; your data is still here. Close every tab and window of this app, then open it again to load the latest version. Do not clear site data.'
    );
  }
  if (error instanceof StorageError) {
    return 'ไม่สามารถเปิดที่เก็บข้อมูลในเบราว์เซอร์ได้ (ลองปิดโหมดส่วนตัว หรือตรวจพื้นที่ว่าง)';
  }
  if (error instanceof ValidationError || error instanceof ImportError) {
    return 'ข้อมูลคันจิในเครื่องไม่ถูกต้อง ลองโหลดหน้าใหม่อีกครั้ง';
  }
  if (error instanceof RepositoryError) {
    return 'อ่านข้อมูลไม่สำเร็จ ลองอีกครั้ง';
  }
  return 'เกิดข้อผิดพลาดที่ไม่คาดคิด ลองอีกครั้ง';
}

/** Development-time diagnostics; the user only ever sees toUserMessage. */
export function logError(error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(error);
  }
}
