import { STUDY_MODES } from '../../types/common';

/** Application defaults (Phase 9 may expose them in Settings). Values come from the Phase 0 option lists. */
export const DEFAULT_DAILY_NEW_LIMIT = 10;
export const DEFAULT_DAILY_REVIEW_LIMIT = 20;

/** Deterministic mode order for new cards of one kanji: A, B, C, D (the Phase 4 mode definitions). */
export const NEW_CARD_MODE_ORDER = STUDY_MODES;
