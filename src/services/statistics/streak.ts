import { dayNumber } from './days';

export interface StreakResult {
  readonly current: number;
  readonly longest: number;
  readonly studiedToday: boolean;
}

/** Longest run of consecutive calendar days in a set of day numbers. */
function longestRun(sortedDays: readonly number[]): number {
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of sortedDays) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

/**
 * Pure. `studyDays` are the local dates that have at least one successful ReviewLog.
 * Current streak: consecutive study days ending today; if today has no review yet, ending yesterday
 * (the streak is still alive until a whole day passes without study); otherwise 0.
 */
export function calculateStreak(studyDays: ReadonlySet<string>, todayKey: string): StreakResult {
  const days = new Set([...studyDays].map(dayNumber));
  const today = dayNumber(todayKey);
  const studiedToday = days.has(today);
  let cursor = studiedToday ? today : today - 1;
  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  return { current, longest: calculateLongestStreak(studyDays), studiedToday };
}

export function calculateLongestStreak(studyDays: ReadonlySet<string>): number {
  return longestRun([...new Set([...studyDays].map(dayNumber))].sort((a, b) => a - b));
}
