import type { ReviewErrorCode } from './useReviewSession';

export const ERROR_TEXT: Record<ReviewErrorCode, { title: string; description: string }> = {
  DATA_LOAD_ERROR: { title: 'โหลดข้อมูลคันจิไม่สำเร็จ', description: 'ลองอีกครั้ง ถ้ายังไม่ได้ให้เปิดแอปใหม่' },
  SESSION_LOAD_ERROR: { title: 'เตรียมรอบทบทวนไม่สำเร็จ', description: 'อ่านข้อมูลการเรียนไม่ได้ ลองอีกครั้ง' },
  REVIEW_SAVE_ERROR: { title: 'บันทึกผลไม่สำเร็จ', description: 'ผลนี้ยังไม่ถูกนับ กดให้คะแนนอีกครั้งเพื่อลองใหม่' },
  SESSION_STATE_ERROR: { title: 'เริ่มรอบทบทวนไม่สำเร็จ', description: 'ระบบยังไม่พร้อม ลองอีกครั้ง' },
};

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function formatAccuracy(accuracy: number | null): string {
  return accuracy === null ? '—' : `${Math.round(accuracy * 100)}%`;
}
