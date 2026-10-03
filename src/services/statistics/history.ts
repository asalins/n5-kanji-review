import type { ReviewLog } from '../../types/entities';
import { calculateAccuracy, isCorrectRating } from './accuracy';
import { dayNumber, keyFromDayNumber, localDateKey } from './days';

export interface PeriodStats {
  readonly reviewCount: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  /** 0..1, or null when there are no reviews. */
  readonly accuracy: number | null;
}

export interface DayStats extends PeriodStats {
  readonly date: string;
}

export interface KeyedLog {
  readonly dateKey: string;
  readonly log: ReviewLog;
}

/** Every successfully stored ReviewLog is one review. Logs are never filtered by dataset version (approved policy). */
export function keyLogs(logs: readonly ReviewLog[]): KeyedLog[] {
  return logs.map((log) => ({ dateKey: localDateKey(log.reviewedAt), log }));
}

export function summarizeLogs(logs: readonly ReviewLog[]): PeriodStats {
  const correctCount = logs.filter((log) => isCorrectRating(log.rating)).length;
  const incorrectCount = logs.length - correctCount;
  return { reviewCount: logs.length, correctCount, incorrectCount, accuracy: calculateAccuracy(correctCount, incorrectCount) };
}

/** One entry per local day for the `days` days ending at `todayKey` (inclusive), oldest first; days without reviews are zeros. */
export function aggregateReviewsByDay(keyed: readonly KeyedLog[], todayKey: string, days: number): DayStats[] {
  const byDate = new Map<string, ReviewLog[]>();
  for (const { dateKey, log } of keyed) {
    const bucket = byDate.get(dateKey);
    if (bucket === undefined) byDate.set(dateKey, [log]);
    else bucket.push(log);
  }
  const today = dayNumber(todayKey);
  const result: DayStats[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = keyFromDayNumber(today - offset);
    result.push({ date, ...summarizeLogs(byDate.get(date) ?? []) });
  }
  return result;
}

/** Reviews of the last `days` local days, today included. */
export function logsInLastDays(keyed: readonly KeyedLog[], todayKey: string, days: number): ReviewLog[] {
  const first = dayNumber(todayKey) - (days - 1);
  const last = dayNumber(todayKey);
  return keyed.filter(({ dateKey }) => dayNumber(dateKey) >= first && dayNumber(dateKey) <= last).map(({ log }) => log);
}
