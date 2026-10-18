import type { ReviewRepository } from '../../repositories/interfaces';
import { CLOCK_SKEW_LIMIT_MS, type ClockState } from './clockCheck';

/**
 * L4-R F10-A: reviews recorded with a date in the future (a device clock that was ahead, e.g. changed while offline).
 * Only answerable with a fresh server time; nothing is changed (the logs stay, are synced and are counted as dated).
 * Limits (stated, not hidden): a log dated in the future whose date real time has already passed, and a log written
 * by a clock that was BEHIND, look like ordinary logs and are not found.
 */
export interface FutureLogs {
  readonly count: number;
  /** Distinct local dates (YYYY-MM-DD) of those logs, oldest first, at most MAX_DATES. */
  readonly dates: readonly string[];
}
const MAX_DATES = 5;
const FAR = 100 * 365 * 86_400_000;

const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** null = cannot tell (no fresh server time). */
export async function findFutureLogs(review: Pick<ReviewRepository, 'getLogs'>, clock: ClockState, deviceNow: number): Promise<FutureLogs | null> {
  if (clock.kind === 'unknown') return null;
  const serverNow = deviceNow + clock.skewMs;
  const from = serverNow + CLOCK_SKEW_LIMIT_MS + clock.uncertaintyMs;
  const logs = await review.getLogs({ from: new Date(from), to: new Date(from + FAR) });
  const dates = [...new Set(logs.map((l) => l.reviewedAt).sort((a, b) => a - b).map(localDate))].slice(0, MAX_DATES);
  return { count: logs.length, dates };
}
