import { z } from 'zod';
import type { DailyLimits } from '../session/allowance';
import type { UserSettings } from '../../types/entities';
import { userSettingsSchema } from '../../types/schemas';
import { ValidationError } from '../../utils/errors';
import { NEW_CARD_OPTIONS, REVIEW_LIMIT_OPTIONS } from './defaults';

const isOneOf = (options: readonly number[]) => (value: number) => options.includes(value);

/** The entity schema plus the product rule: limits must be one of the allowed options. */
const settingsRulesSchema = userSettingsSchema.check(
  z.refine((s: UserSettings) => isOneOf(NEW_CARD_OPTIONS)(s.dailyNewCards), {
    message: `dailyNewCards must be one of ${NEW_CARD_OPTIONS.join(', ')}`,
    path: ['dailyNewCards'],
  }),
  z.refine((s: UserSettings) => isOneOf(REVIEW_LIMIT_OPTIONS)(s.dailyReviewLimit), {
    message: `dailyReviewLimit must be one of ${REVIEW_LIMIT_OPTIONS.join(', ')}`,
    path: ['dailyReviewLimit'],
  }),
);

export function isValidSettings(value: unknown): value is UserSettings {
  return settingsRulesSchema.safeParse(value).success;
}

/** Rejects NaN, Infinity, negatives, out-of-list limits and unknown enum values. */
export function validateSettings(value: unknown): UserSettings {
  const result = settingsRulesSchema.safeParse(value);
  if (!result.success) throw new ValidationError(`Invalid settings: ${z.prettifyError(result.error)}`, { cause: result.error });
  return result.data;
}

/** The persisted field names map onto the session's limits: dailyNewCards -> newCards. */
export function limitsFromSettings(settings: UserSettings): DailyLimits {
  return { newCards: settings.dailyNewCards, reviews: settings.dailyReviewLimit };
}
