import type { StateFilter } from '../../services/kanjiSearch/kanjiReviewStates';

/** Thai first, English next to it (each feature keeps its own strings; there is no central i18n). */
export const TEXT = {
  title: 'ค้นหาคันจิ · Search Kanji',
  back: '← กลับ · Back',
  searchLabel: 'ค้นหา · Search',
  searchHint: 'คันจิ ความหมาย คำอ่าน หรือโรมาจิ เช่น 水, water, みず, mizu',
  stateLabel: 'สถานะ · State',
  dueNow: 'ถึงกำหนดทบทวน · Due now',
  stateNote: 'ตัวกรองดูจากการ์ดทั้ง 4 โหมดของคันจิ คันจิหนึ่งตัวอาจผ่านได้มากกว่าหนึ่งสถานะ',
  loading: 'กำลังโหลดข้อมูลคันจิ… · Loading',
  errorTitle: 'โหลดข้อมูลไม่สำเร็จ · Could not load',
  errorDescription: 'ลองอีกครั้ง ถ้ายังไม่ได้ให้เปิดแอปใหม่',
  retry: 'ลองอีกครั้ง',
  noResults: 'ไม่พบคันจิที่ตรงกับการค้นหา',
  noResultsHint: 'ลองคำอื่น หรือล้างตัวกรอง',
  meanings: 'ความหมาย · Meaning',
  thai: 'ไทย · Thai',
  onyomi: "On'yomi",
  kunyomi: "Kun'yomi",
  due: 'ถึงกำหนด · Due',
} as const;

export const STATE_OPTIONS: ReadonlyArray<{ value: StateFilter; label: string }> = [
  { value: 'ALL', label: 'ทั้งหมด · All' },
  { value: 'NEW', label: 'ใหม่ · New (ยังไม่เคยเรียน)' },
  { value: 'LEARNING', label: 'กำลังเรียน · Learning' },
  { value: 'REVIEW', label: 'ทบทวน · Review' },
  { value: 'RELEARNING', label: 'เรียนซ้ำ · Relearning' },
  { value: 'MASTERED', label: 'Mastered Kanji (ครบทั้ง 4 โหมด)' },
];

export function resultCount(count: number): string {
  return `พบ ${count} ตัว · ${count} found`;
}

export const BADGE = {
  NEW: 'ใหม่ · New',
  LEARNING: 'LEARNING',
  REVIEW: 'REVIEW',
  RELEARNING: 'RELEARNING',
  MASTERED: 'Mastered Kanji',
} as const;
