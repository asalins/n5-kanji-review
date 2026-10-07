import type { LearningState } from '../../types/common';

export const TEXT = {
  back: '← ค้นหา · Search',
  loading: 'กำลังโหลด… · Loading…',
  error: 'โหลดข้อมูลคันจิไม่สำเร็จ · Could not load this kanji',
  retry: 'ลองอีกครั้ง · Retry',
  notFound: 'ไม่พบคันจินี้ในชุดข้อมูล · This kanji is not in the dataset',
  meanings: 'ความหมาย · Meanings',
  thai: 'ภาษาไทย · Thai',
  english: 'ภาษาอังกฤษ · English',
  readings: 'คำอ่าน · Readings',
  onyomi: "On'yomi",
  kunyomi: "Kun'yomi",
  none: '—',
  facts: 'ข้อมูล · Facts',
  strokes: 'จำนวนขีด · Strokes',
  frequency: 'อันดับความถี่ · Frequency rank',
  progress: 'การเรียน · Progress',
  kanjiLearned: 'เรียนแล้ว · Learned',
  kanjiNew: 'ยังไม่เริ่ม · Not started',
  kanjiMastered: 'จำได้แม่นแล้ว · Mastered Kanji',
  notStarted: 'ยังไม่เริ่ม · Not started',
  dueNow: 'ถึงกำหนดทบทวน · Due now',
  next: 'ทบทวนครั้งถัดไป · Next review',
} as const;

export const STATE_LABEL: Record<LearningState, string> = {
  NEW: 'ใหม่ · New',
  LEARNING: 'กำลังเรียน · Learning',
  REVIEW: 'ทบทวน · Review',
  RELEARNING: 'เรียนซ้ำ · Relearning',
  MASTERED: 'จำได้แม่น · Mastered',
};
