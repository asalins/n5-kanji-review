import type { LearningState } from '../../types/entities';

/** Thai first, English next to it (the project has no central i18n; each feature keeps its strings here). */
export const TEXT = {
  title: 'ความก้าวหน้า · Progress',
  loading: 'กำลังโหลดสถิติ… · Loading statistics',
  errorTitle: 'โหลดสถิติไม่สำเร็จ · Could not load statistics',
  errorDescription: 'ลองอีกครั้ง ถ้ายังไม่ได้ให้เปิดแอปใหม่',
  retry: 'ลองอีกครั้ง',
  today: 'วันนี้ · Today',
  reviewsToday: 'ทบทวนวันนี้ · Reviews today',
  correct: 'ถูก · Correct',
  incorrect: 'ผิด · Incorrect',
  accuracy: 'ความแม่นยำ · Accuracy',
  reviewQuota: 'โควตาทบทวน · Review quota',
  newCards: 'การ์ดใหม่ · New cards',
  studiedToday: 'วันนี้เรียนแล้ว · Studied today',
  notStudiedToday: 'วันนี้ยังไม่ได้เรียน · Not studied today',
  queue: 'คิววันนี้ · Today’s queue',
  due: 'ถึงกำหนด · Due',
  newAvailable: 'การ์ดใหม่ที่เรียนได้วันนี้ · New available today',
  kanjiProgress: 'คันจิ · Kanji',
  learned: 'เรียนแล้ว · Learned',
  mastered: 'ชำนาญแล้ว · Mastered',
  remaining: 'ยังเหลือ · Remaining',
  reviewCards: 'การ์ดทบทวน · Review Cards',
  reviewCardsByState: 'การ์ดทบทวนแยกตามสถานะ · Review Cards by state',
  streak: 'เรียนต่อเนื่อง · Streak',
  currentStreak: 'ปัจจุบัน · Current',
  longestStreak: 'นานที่สุด · Longest',
  days: 'วัน · days',
  history: 'ประวัติ · History',
  last7: '7 วัน · 7 days',
  last30: '30 วัน · 30 days',
  allTime: 'ทั้งหมด · All time',
  noHistory: 'ยังไม่มีประวัติการเรียน · No review history yet',
  reviews: 'ทบทวน · Reviews',
  date: 'วันที่ · Date',
  noAccuracy: '—',
} as const;

export const STATE_LABEL: Record<LearningState, string> = {
  NEW: 'NEW · ใหม่',
  LEARNING: 'LEARNING · กำลังเรียน',
  REVIEW: 'REVIEW · ทบทวน',
  RELEARNING: 'RELEARNING · เรียนซ้ำ',
  MASTERED: 'MASTERED · ชำนาญ',
};

/** 0..1 ratio (or null) as "80%"; null (no reviews) is a dash, never 0%. */
export function formatAccuracyRatio(accuracy: number | null): string {
  return accuracy === null ? TEXT.noAccuracy : `${Math.round(accuracy * 100)}%`;
}

/** 0..100 value (or null) as "37%". */
export function formatPercent(percent: number | null): string {
  return percent === null ? TEXT.noAccuracy : `${Math.round(percent)}%`;
}

/** 2026-10-03 -> 03/10 */
export function shortDate(key: string): string {
  const [, month = '', day = ''] = key.split('-');
  return `${day}/${month}`;
}
