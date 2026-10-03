import type { JlptLevel } from '../../types/entities';

/** The level whose Kanji the dashboard measures. The total comes from the dataset, never from a literal count. */
export const STATISTICS_LEVEL: JlptLevel = 'N5';

/** History windows in local calendar days, today included. */
export const HISTORY_SHORT_DAYS = 7;
export const HISTORY_LONG_DAYS = 30;

/** Upper bound used to read every due card in one call (far above the number of cards that can exist). */
export const ALL_DUE_CARDS_LIMIT = 100_000;
