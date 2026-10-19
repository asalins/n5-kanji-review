import type { AudioFailure } from '../../services/audio/audioPlayer';

export const TEXT = {
  play: (label: string) => `ฟังเสียง ${label} · Listen`,
  playing: 'กำลังเล่น… · Playing…',
  speed: 'ความเร็ว · Speed',
  voice: 'เสียง · Voice',
  female: 'หญิง · Female',
  male: 'ชาย · Male',
} as const;

export const FAILURE_TEXT: Record<AudioFailure, string> = {
  'no-voice': 'อุปกรณ์นี้ไม่มีเสียงภาษาญี่ปุ่น · No Japanese voice on this device',
  unsupported: 'เบราว์เซอร์นี้เล่นเสียงไม่ได้ · This browser cannot play audio',
  failed: 'เล่นเสียงไม่สำเร็จ ลองอีกครั้ง · Could not play the audio, try again',
};
