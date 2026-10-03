import { ValidationError } from './errors';

export interface LocalDay {
  /** Local calendar date, YYYY-MM-DD (the runtime's time zone, never UTC and never a fixed zone). */
  readonly key: string;
  /** Start of the local day (inclusive). */
  readonly from: Date;
  /** Start of the NEXT local day (exclusive), so DST days of 23 or 25 hours are handled by the platform. */
  readonly to: Date;
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/**
 * The local calendar day that contains the instant `nowMs`. Used ONLY for daily limits; SRS scheduling
 * stays instant-based. Pure given the runtime time zone.
 */
export function localDay(nowMs: number): LocalDay {
  if (!Number.isFinite(nowMs)) {
    throw new ValidationError(`Invalid instant for local day: ${String(nowMs)}`);
  }
  const instant = new Date(nowMs);
  const year = instant.getFullYear();
  const month = instant.getMonth();
  const day = instant.getDate();
  return {
    key: `${pad(year, 4)}-${pad(month + 1)}-${pad(day)}`,
    from: new Date(year, month, day),
    to: new Date(year, month, day + 1),
  };
}
