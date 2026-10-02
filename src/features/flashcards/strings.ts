import type { ReviewRating, StudyMode } from '../../types/entities';

/** User-facing labels in one place so UI language support (Phase 9) can replace them. */
export const MODE_INFO: Record<StudyMode, { title: string; subtitle: string; question: string }> = {
  A: { title: 'Kanji → Meaning', subtitle: 'เห็นคันจิ ตอบความหมาย', question: 'ความหมายคืออะไร?' },
  B: { title: 'Meaning → Kanji', subtitle: 'เห็นความหมาย ตอบคันจิ', question: 'คือคันจิตัวไหน?' },
  C: { title: 'Kanji → Reading', subtitle: 'เห็นคันจิ ตอบการอ่าน', question: 'อ่านว่าอย่างไร?' },
  D: { title: 'Reading → Kanji', subtitle: 'เห็นการอ่าน ตอบคันจิ', question: 'คือคันจิตัวไหน?' },
};

export const RATING_INFO: Record<ReviewRating, { label: string; hint: string }> = {
  AGAIN: { label: 'Again', hint: 'ยังจำไม่ได้' },
  HARD: { label: 'Hard', hint: 'จำได้ยาก' },
  GOOD: { label: 'Good', hint: 'จำได้' },
  EASY: { label: 'Easy', hint: 'ง่ายมาก' },
};
