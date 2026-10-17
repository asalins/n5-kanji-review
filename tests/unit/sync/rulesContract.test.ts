import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEARNING_STATES, REVIEW_RATINGS, STUDY_MODES, THEMES, UI_LANGUAGES } from '../../../src/types/common';
import { NEW_CARD_OPTIONS, REVIEW_LIMIT_OPTIONS } from '../../../src/services/settings/defaults';

// The Firestore rules repeat the app's allowed values; they must never drift apart (checked without an emulator).
const rules = readFileSync('firestore.rules', 'utf8');
const listAfter = (needle: string) => {
  const at = rules.indexOf(needle);
  expect(at, needle).toBeGreaterThan(-1);
  const list = rules.slice(rules.indexOf('[', at), rules.indexOf(']', at) + 1);
  return JSON.parse(list.replace(/'/g, '"')) as unknown[];
};

describe('firestore.rules matches the app data model', () => {
  it('enums and options', () => {
    expect(listAfter('d.rating in')).toEqual([...REVIEW_RATINGS]);
    expect(listAfter("return v in")).toEqual([...LEARNING_STATES]);
    expect(listAfter('d.theme in')).toEqual([...THEMES]);
    expect(listAfter('d.uiLanguage in')).toEqual([...UI_LANGUAGES]);
    expect(listAfter('d.studyMode in')).toEqual([...STUDY_MODES]);
    expect(listAfter('d.dailyNewCards in')).toEqual([...NEW_CARD_OPTIONS]);
    expect(listAfter('d.dailyReviewLimit in')).toEqual([...REVIEW_LIMIT_OPTIONS]);
  });
  it('log fields = the 10 ReviewLog fields + epoch + uploadedAt; logs are create-only; default deny', () => {
    expect(listAfter("d.keys().hasOnly(['id'")).toEqual(['id', 'cardId', 'rating', 'reviewedAt', 'durationMs', 'stateBefore', 'stateAfter', 'datasetVersion', 'deviceId', 'originalId', 'epoch', 'uploadedAt']);
    expect(rules).toMatch(/allow update: if false;/);
    expect(rules).not.toMatch(/allow (read|write)[^;]*: if true/);
  });
});
