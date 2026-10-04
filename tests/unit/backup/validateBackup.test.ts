import { describe, expect, it } from 'vitest';
import { assertCompatible } from '../../../src/services/backup/backupCompatibility';
import { BackupError, type BackupErrorCode } from '../../../src/services/backup/backupErrors';
import { parseBackupText, validateBackup } from '../../../src/services/backup/validateBackup';
import { validBackup } from '../../helpers/backupFixtures';

const code = (fn: () => unknown): BackupErrorCode | 'NO ERROR' => {
  try {
    fn();
    return 'NO ERROR';
  } catch (error) {
    if (error instanceof BackupError) return error.code;
    throw error;
  }
};
const v = (raw: unknown) => () => validateBackup(raw);
const b = validBackup();
const [card0, card1] = b.data.reviewCards;
const [log0] = b.data.reviewLogs;

describe('backup envelope and records (Zod, before any write)', () => {
  it('accepts a valid backup and keeps every value exactly', () => {
    expect(validateBackup(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });
  it('invalid JSON', () => expect(code(() => parseBackupText('{ "format": '))).toBe('INVALID_JSON'));
  it('not an object / missing format / wrong format', () => {
    expect(code(v(42))).toBe('INVALID_BACKUP_FORMAT');
    expect(code(v({ ...b, format: undefined }))).toBe('INVALID_BACKUP_FORMAT');
    expect(code(v({ ...b, format: 'some-other-app' }))).toBe('INVALID_BACKUP_FORMAT');
  });
  it('unsupported formatVersion', () => {
    expect(code(v({ ...b, formatVersion: 2 }))).toBe('UNSUPPORTED_FORMAT_VERSION');
    expect(code(v({ ...b, formatVersion: 0 }))).toBe('UNSUPPORTED_FORMAT_VERSION');
  });
  it('invalid envelope fields: timestamp, schema version, missing data', () => {
    expect(code(v({ ...b, exportedAt: 'yesterday' }))).toBe('INVALID_BACKUP_FORMAT');
    expect(code(v({ ...b, databaseSchemaVersion: 0 }))).toBe('INVALID_BACKUP_FORMAT');
    expect(code(v({ ...b, algorithmVersion: '' }))).toBe('INVALID_BACKUP_FORMAT');
    expect(code(v({ ...b, data: undefined }))).toBe('INVALID_BACKUP_FORMAT');
  });
  it.each([
    ['card state enum', { reviewCards: [{ ...card0, state: 'BOGUS' }] }],
    ['card negative interval', { reviewCards: [{ ...card0, interval: -1 }] }],
    ['card negative counter', { reviewCards: [{ ...card0, reviewCount: -1 }] }],
    ['card non-integer due', { reviewCards: [{ ...card0, due: 1.5 }] }],
    ['card id not itemType:itemId:mode', { reviewCards: [{ ...card0, id: 'kanji:kanji:U+6C34:Z' }] }],
    ['card missing algorithmVersion', { reviewCards: [{ ...card0, algorithmVersion: '' }] }],
    ['log rating enum', { reviewLogs: [{ ...log0, rating: 'MAYBE' }] }],
    ['log negative duration', { reviewLogs: [{ ...log0, durationMs: -3 }] }],
    ['session bad timestamp', { studySessions: [{ id: 's', startedAt: -1, endedAt: null, cardIds: [], summary: null }] }],
    ['settings theme enum', { userSettings: { ...b.data.userSettings, theme: 'blue' } }],
    ['settings negative limit', { userSettings: { ...b.data.userSettings, dailyNewCards: -5 } }],
  ])('rejects an invalid record: %s', (_label, data) => {
    expect(code(v({ ...b, data: { ...b.data, ...data } }))).toBe('INVALID_RECORD');
  });
  it('rejects settings outside the allowed options (7 new cards, 1000 reviews)', () => {
    expect(code(v(validBackup({}, { userSettings: { ...b.data.userSettings!, dailyNewCards: 7 } })))).toBe('INVALID_RECORD');
    expect(code(v(validBackup({}, { userSettings: { ...b.data.userSettings!, dailyReviewLimit: 1000 } })))).toBe('INVALID_RECORD');
  });
  it('accepts a backup without settings (null)', () => expect(code(v(validBackup({}, { userSettings: null })))).toBe('NO ERROR'));
});

describe('integrity', () => {
  it.each([
    ['card', { reviewCards: [card0!, card1!, card0!] }],
    ['log', { reviewLogs: [log0!, log0!] }],
    ['session', { studySessions: [b.data.studySessions[0]!, b.data.studySessions[0]!] }],
  ])('rejects duplicate %s ids instead of choosing one', (_label, data) => {
    expect(code(v(validBackup({}, data)))).toBe('INVALID_RECORD');
  });
  it('rejects a review log whose card is not in the backup', () => {
    expect(code(v(validBackup({}, { reviewLogs: [{ ...log0!, cardId: 'kanji:kanji:U+6728:A' }] })))).toBe('INVALID_RECORD');
  });
  it('does not require session cardIds to exist (approved)', () => {
    expect(code(v(validBackup({}, { studySessions: [{ ...b.data.studySessions[0]!, cardIds: ['kanji:kanji:U+6728:D'] }] })))).toBe('NO ERROR');
  });
  it('a corrupt record late in a long list still fails the whole backup', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ ...log0!, id: `log-${i}` }));
    many[49] = { ...many[49]!, stateAfter: 'NOPE' as never };
    expect(code(v(validBackup({}, { reviewLogs: many })))).toBe('INVALID_RECORD');
  });
});

describe('compatibility: strict, no mapping', () => {
  const env = { datasetVersion: 'n5-2026.10.01', algorithmVersion: 'srs-v1', kanjiIds: new Set(['kanji:U+6C34', 'kanji:U+706B', 'kanji:U+5C71']) };
  const check = (backup = validBackup(), current = env) => code(() => assertCompatible(validateBackup(backup), current));
  it('same dataset and algorithm -> compatible', () => expect(check()).toBe('NO ERROR'));
  it('an unknown dataset version (backup or current) -> DATASET_MISMATCH', () => {
    expect(check(validBackup({ datasetVersion: null }))).toBe('DATASET_MISMATCH');
    expect(check(validBackup(), { ...env, datasetVersion: null as never })).toBe('DATASET_MISMATCH');
  });
  it('the same dataset version -> compatible, no warning', () => {
    expect(assertCompatible(validateBackup(validBackup()), env)).toEqual({ datasetWarning: null });
  });
  it('another dataset version with every kanji present -> compatible WITH the mandatory warning', () => {
    expect(assertCompatible(validateBackup(validBackup({ datasetVersion: 'n5-2025.01.01' })), env)).toEqual({
      datasetWarning: { backupVersion: 'n5-2025.01.01', currentVersion: 'n5-2026.10.01' },
    });
  });
  it('another dataset version with even ONE kanji missing -> DATASET_MISMATCH', () => {
    expect(check(validBackup({ datasetVersion: 'n5-2025.01.01' }), { ...env, kanjiIds: new Set(['kanji:U+6C34', 'kanji:U+706B']) })).toBe('DATASET_MISMATCH');
  });
  it('another dataset version does not relax the algorithm rule', () => {
    expect(check(validBackup({ datasetVersion: 'n5-2025.01.01', algorithmVersion: 'srs-v2' }))).toBe('ALGORITHM_MISMATCH');
  });
  it('a card for a kanji that is not in the current dataset -> DATASET_MISMATCH (never guessed)', () => {
    expect(check(validBackup(), { ...env, kanjiIds: new Set(['kanji:U+6C34']) })).toBe('DATASET_MISMATCH');
  });
  it('another algorithm version in the envelope or on any card -> ALGORITHM_MISMATCH', () => {
    expect(check(validBackup({ algorithmVersion: 'srs-v2' }))).toBe('ALGORITHM_MISMATCH');
    const b2 = validBackup();
    expect(check(validBackup({}, { reviewCards: [b2.data.reviewCards[0]!, { ...b2.data.reviewCards[1]!, algorithmVersion: 'srs-v2' }, ...b2.data.reviewCards.slice(2)] }))).toBe('ALGORITHM_MISMATCH');
  });
});
