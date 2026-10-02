import { MINUTES_PER_DAY } from './constants';

/** Integer division of n/d rounded half up. Only for non-negative integers (no float involved). */
export function roundDiv(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const daysToMinutes = (days: number): number => days * MINUTES_PER_DAY;

/** Whole days for a minute interval, rounded half up. */
export const minutesToDays = (minutes: number): number => roundDiv(minutes, MINUTES_PER_DAY);

/**
 * Which step of `steps` a card is on, recovered from its interval: the first step at least as long as
 * the interval (0 for a NEW card), or the last step when the interval is longer than all of them.
 * For cards this algorithm produced the interval is always exactly one of the steps.
 */
export function stepIndexFor(steps: readonly number[], interval: number): number {
  const index = steps.findIndex((step) => step >= interval);
  return index === -1 ? steps.length - 1 : index;
}
