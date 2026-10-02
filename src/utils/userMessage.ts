import { ImportError, RepositoryError, StorageError, ValidationError } from './errors';

/** Safe, user-facing text for an error. Never exposes database internals or raw exception text. */
export function toUserMessage(error: unknown): string {
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
