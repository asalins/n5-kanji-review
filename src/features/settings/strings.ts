import type { BackupErrorCode } from '../../services/backup/backupErrors';
import type { Theme } from '../../types/entities';

export const TEXT = {
  title: 'ตั้งค่า · Settings',
  back: '← กลับ · Back',
  limits: 'จำนวนต่อวัน · Study limits',
  newCards: 'การ์ดใหม่ต่อวัน · New cards per day',
  reviews: 'ทบทวนต่อวัน · Reviews per day',
  theme: 'ธีม · Theme',
  saved: 'บันทึกแล้ว · Saved',
  saveFailed: 'บันทึกไม่สำเร็จ ค่าเดิมยังอยู่ · Could not save; the previous values are kept',
  loadFailed: 'อ่านการตั้งค่าไม่สำเร็จ กำลังใช้ค่าเริ่มต้น · Could not read settings; using defaults',
  retry: 'ลองอีกครั้ง · Retry',
  backup: 'สำรองและกู้คืน · Backup & Restore',
  export: 'ส่งออกข้อมูลสำรอง · Export backup',
  exported: 'สร้างไฟล์สำรองแล้ว · Backup file created',
  exportFailed: 'ส่งออกไม่สำเร็จ · Export failed',
  importLabel: 'นำเข้าข้อมูลสำรอง (.json) · Import backup',
  checking: 'กำลังตรวจไฟล์… · Checking the file…',
  importWarningTitle: 'นำเข้าข้อมูลสำรองนี้? · Import this backup?',
  importWarning:
    'ข้อมูลการเรียนปัจจุบันทั้งหมดจะถูกแทนที่ด้วยข้อมูลในไฟล์นี้ · Importing this backup will replace your current learning data.',
  importConfirm: 'แทนที่ข้อมูลของฉัน · Replace my data',
  cancel: 'ยกเลิก · Cancel',
  datasetWarning: (backup: string, current: string) =>
    `ไฟล์สำรองนี้สร้างจากชุดข้อมูลคันจิเวอร์ชัน ${backup} (ปัจจุบัน ${current}) ความคืบหน้าจะใช้กับคันจิตัวเดิม แต่ความหมายหรือการอ่านบางส่วนอาจเปลี่ยนไป · This backup was created with a different dataset version (${backup}; current ${current}). Your progress applies to the same kanji, but some meanings or readings may have changed.`,
  imported: 'กู้คืนข้อมูลแล้ว · Backup restored',
  about: 'เกี่ยวกับและแหล่งข้อมูล · About & Sources',
  openAbout: 'แหล่งข้อมูลและสัญญาอนุญาต · Sources & licences',
  danger: 'ลบข้อมูล · Danger zone',
  resetProgress: 'ลบความคืบหน้าทั้งหมด · Reset progress',
  resetProgressWarning:
    'การ์ดทบทวน ประวัติ และรอบการเรียนทั้งหมดจะถูกลบถาวร (การตั้งค่าและชุดคันจิยังอยู่) กู้คืนได้เฉพาะจากไฟล์สำรองที่ส่งออกไว้ · This will permanently delete your learning progress. It cannot be undone unless you have an exported backup.',
  resetSettings: 'คืนค่าการตั้งค่าเริ่มต้น · Reset settings',
  resetSettingsWarning: 'การตั้งค่าจะกลับเป็นค่าเริ่มต้น (10 / 20, ธีมตามระบบ) ความคืบหน้าไม่ถูกลบ · Settings go back to the defaults; progress is kept.',
  understand: 'ฉันเข้าใจ · I understand',
  confirmReset: 'ลบเลย · Delete',
  confirmResetSettings: 'คืนค่า · Reset',
  resetDone: 'ลบความคืบหน้าแล้ว · Progress deleted',
  resetSettingsDone: 'คืนค่าการตั้งค่าแล้ว · Settings reset',
  actionFailed: 'ทำรายการไม่สำเร็จ ข้อมูลไม่ถูกเปลี่ยนแปลง · The action failed; your data has not been changed.',
  unchanged: 'ข้อมูลการเรียนเดิมของคุณไม่ถูกเปลี่ยนแปลง · Your existing learning data has not been changed.',
  summaryDate: 'วันที่สำรอง · Backup date',
  summaryDataset: 'ชุดข้อมูล · Dataset',
  summaryCards: 'การ์ดทบทวน · Review cards',
  summaryLogs: 'ประวัติการทบทวน · Review logs',
  summarySessions: 'รอบการเรียน · Study sessions',
  summarySettings: 'การตั้งค่า · Settings',
  yes: 'มี · included',
  no: 'ไม่มี (ใช้ค่าเริ่มต้น) · not included (defaults)',
} as const;

export const THEME_LABEL: Record<Theme, string> = {
  system: 'ตามระบบ · System',
  light: 'สว่าง · Light',
  dark: 'มืด · Dark',
};

/** Safe, user-facing explanation per error code (never the raw exception text). */
export const IMPORT_ERROR: Record<BackupErrorCode, string> = {
  INVALID_FILE: 'อ่านไฟล์ไม่ได้ · The file could not be read.',
  INVALID_JSON: 'ไฟล์นี้ไม่ใช่ JSON ที่ถูกต้อง · The file is not valid JSON.',
  INVALID_BACKUP_FORMAT: 'ไฟล์นี้ไม่ใช่ข้อมูลสำรองของแอปนี้ · This file is not a backup of this application.',
  UNSUPPORTED_FORMAT_VERSION: 'ไฟล์สำรองนี้เป็นเวอร์ชันที่แอปนี้ไม่รองรับ · This backup format version is not supported.',
  DATASET_MISMATCH:
    'ไฟล์สำรองนี้มีคันจิที่ไม่อยู่ในชุดข้อมูลปัจจุบัน หรือมาจากชุดข้อมูลที่ไม่ทราบเวอร์ชัน จึงกู้คืนอย่างปลอดภัยไม่ได้ · This backup refers to kanji that are not in the current dataset (or to an unknown dataset) and cannot be safely restored.',
  ALGORITHM_MISMATCH:
    'ไฟล์สำรองนี้สร้างจากระบบทบทวนคนละเวอร์ชัน · This backup was created by a different review algorithm version and cannot be restored.',
  INVALID_RECORD: 'ไฟล์สำรองมีข้อมูลการเรียนที่ไม่ถูกต้อง · The backup contains invalid learning data.',
  IMPORT_TRANSACTION_FAILED: 'บันทึกข้อมูลไม่สำเร็จ · The backup could not be saved.',
};
