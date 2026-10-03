import { localDay } from '../../utils/localDay';

const MS_PER_DAY = 86_400_000;

/** Local calendar date key (YYYY-MM-DD) of an instant, in the runtime's time zone. */
export function localDateKey(instantMs: number): string {
  return localDay(instantMs).key;
}

/** Whole-day index of a YYYY-MM-DD key. Pure calendar arithmetic: consecutive dates differ by exactly 1 in any zone. */
export function dayNumber(key: string): number {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function keyFromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}
