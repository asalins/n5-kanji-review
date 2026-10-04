import { DEFAULT_DAILY_NEW_LIMIT, DEFAULT_DAILY_REVIEW_LIMIT } from '../session/config';
import type { UserSettings } from '../../types/entities';

/** Allowed values (Phase 0 design, approved in the Phase 9 gate). */
export const NEW_CARD_OPTIONS = [5, 10, 20, 30] as const;
export const REVIEW_LIMIT_OPTIONS = [10, 20, 50, 100] as const;

/**
 * Used when no settings are saved. Never written automatically. Only the daily limits and the theme have a
 * feature behind them; the other fields are required by the entity and keep these values until a feature exists.
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  dailyNewCards: DEFAULT_DAILY_NEW_LIMIT,
  dailyReviewLimit: DEFAULT_DAILY_REVIEW_LIMIT,
  theme: 'system',
  uiLanguage: 'th',
  soundEnabled: false,
  autoPlay: false,
  studyMode: 'A',
  animationsEnabled: true,
};
