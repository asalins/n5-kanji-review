import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbDeviceRepository } from '../../../src/repositories/indexeddb/IndexedDbDeviceRepository';
import { IndexedDbSettingsRepository } from '../../../src/repositories/indexeddb/IndexedDbSettingsRepository';
import type { Repositories } from '../../../src/repositories/indexeddb';
import type { UserDataSnapshot } from '../../../src/repositories/interfaces';
import { BackupError, type BackupErrorCode } from '../../../src/services/backup/backupErrors';
import { applyImport, createBackup, prepareImport, resetProgress, resetSettings, type BackupDeps } from '../../../src/services/backup/backupService';
import { validateBackup } from '../../../src/services/backup/validateBackup';
import { DEFAULT_USER_SETTINGS } from '../../../src/services/settings/defaults';
import { SINGLETON_KEY, STORES } from '../../../src/services/storage/schema';
import type { AppDatabase } from '../../../src/services/storage/database';
import { isUuidV4 } from '../../../src/utils/uuid';
import { validBackup, validBackupV1 } from '../../helpers/backupFixtures';
import { openRealRepositories } from '../../helpers/realData';
import { NOON } from '../../helpers/sessionFixtures';

/** Written by the PRODUCTION app (c6fdf23, schema v2): real repositories, real orchestrator, real export. */
const PRODUCTION_V1_TEXT = readFileSync('tests/fixtures/production-backup-v1.json', 'utf8');
const PRODUCTION_V1 = JSON.parse(PRODUCTION_V1_TEXT) as {
  formatVersion: number;
  data: { reviewCards: unknown[]; reviewLogs: Record<string, unknown>[]; studySessions: unknown[]; userSettings: Record<string, unknown> };
};

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  ({ repos, dispose } = await openRealRepositories());
});
afterEach(async () => {
  await dispose();
});

const deps = (r: Repositories = repos, now = NOON): BackupDeps => ({ backup: r.backup, kanji: r.kanji, now: () => now });
const read = async (r: Repositories = repos): Promise<UserDataSnapshot> => {
  const { databaseSchemaVersion: _v, ...data } = await r.backup.readUserData();
  return data;
};
const importText = async (text: string, r: Repositories = repos) => applyImport(deps(r), await prepareImport(deps(r), text));
const code = (fn: () => unknown): BackupErrorCode | 'NO ERROR' => {
  try {
    fn();
    return 'NO ERROR';
  } catch (error) {
    if (error instanceof BackupError) return error.code;
    throw error;
  }
};

describe('backup format 2', () => {
  it('export writes format 2 with log provenance and settings.updatedAt, and never the installation identity', async () => {
    await importText(JSON.stringify(validBackup()));
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, dailyNewCards: 30 });
    const { backup } = await createBackup(deps());
    expect(backup).toMatchObject({ formatVersion: 2, databaseSchemaVersion: 3 });
    expect(Object.keys(backup).sort()).toEqual(['algorithmVersion', 'data', 'databaseSchemaVersion', 'datasetVersion', 'exportedAt', 'format', 'formatVersion']);
    expect(Object.keys(backup.data).sort()).toEqual(['reviewCards', 'reviewLogs', 'studySessions', 'userSettings']);
    expect(backup.data.reviewLogs.every((l) => 'deviceId' in l && 'originalId' in l)).toBe(true);
    expect(backup.data.userSettings?.updatedAt).toBeGreaterThan(0);
    const text = JSON.stringify(backup);
    expect(text).not.toContain('deviceMeta');
    expect(text).not.toContain(await repos.device.getDeviceId()); // no log was recorded here, so this device's id must not appear
  });

  it('export v2 -> import v2 (another installation) -> the same learning data', async () => {
    await importText(PRODUCTION_V1_TEXT);
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, theme: 'dark' });
    const exported = JSON.stringify((await createBackup(deps())).backup);
    const other = await openRealRepositories();
    try {
      await importText(exported, other.repos);
      expect(await read(other.repos)).toEqual(await read());
      expect(await other.repos.device.getDeviceId()).not.toBe(await repos.device.getDeviceId());
    } finally {
      await other.dispose();
    }
  });

  it('a corrupted format 2 file is rejected before any write', async () => {
    const good = validBackup();
    const [log] = good.data.reviewLogs;
    const bad = (data: object) => code(() => validateBackup({ ...good, data: { ...good.data, ...data } }));
    expect(bad({ reviewLogs: [{ ...log!, originalId: 'x' }] })).toBe('INVALID_RECORD'); // renamed id must be originalId~...
    expect(bad({ reviewLogs: [{ ...log!, deviceId: undefined }] })).toBe('INVALID_RECORD');
    expect(bad({ userSettings: { ...good.data.userSettings!, updatedAt: -1 } })).toBe('INVALID_RECORD');
    const { updatedAt: _u, ...noStamp } = good.data.userSettings!;
    expect(bad({ userSettings: noStamp })).toBe('INVALID_RECORD');
    expect(code(() => validateBackup({ ...validBackupV1(), formatVersion: 2 }))).toBe('INVALID_RECORD'); // v1 records labelled 2
  });
});

describe('backup format 1 from production', () => {
  it('is the real production shape (format 1, schema 2, no new fields)', () => {
    expect(PRODUCTION_V1.formatVersion).toBe(1);
    expect(PRODUCTION_V1.data.reviewLogs.length).toBeGreaterThan(0);
    expect(PRODUCTION_V1.data.reviewLogs.every((l) => !('deviceId' in l) && /#\d+$/.test(String(l.id)))).toBe(true);
    expect('updatedAt' in PRODUCTION_V1.data.userSettings).toBe(false);
  });

  it('imports without changing any learning data: same cards, sessions, log ids and values; deviceId/originalId null; updatedAt 0', async () => {
    await importText(PRODUCTION_V1_TEXT);
    const data = await read();
    const sortById = <T extends { id: unknown }>(list: readonly T[]) => [...list].sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
    expect(data.reviewCards).toEqual(sortById(PRODUCTION_V1.data.reviewCards as { id: string }[]));
    expect(data.studySessions).toEqual(sortById(PRODUCTION_V1.data.studySessions as { id: string }[]));
    expect(data.reviewLogs).toEqual(sortById(PRODUCTION_V1.data.reviewLogs.map((l) => ({ ...l, deviceId: null, originalId: null })) as unknown as { id: string }[]));
    expect(data.userSettings).toEqual({ ...PRODUCTION_V1.data.userSettings, updatedAt: 0 });
  });

  it('v1 -> import -> export v2 -> import v2 elsewhere: identical', async () => {
    await importText(PRODUCTION_V1_TEXT);
    const v2 = JSON.stringify((await createBackup(deps())).backup);
    const other = await openRealRepositories();
    try {
      await importText(v2, other.repos);
      expect(await read(other.repos)).toEqual(await read());
    } finally {
      await other.dispose();
    }
  });
});

describe('installation identity (deviceMeta) vs user data', () => {
  it('is a UUID created once; Import (Replace), Reset progress and Reset settings never change it', async () => {
    const id = await repos.device.getDeviceId();
    expect(isUuidV4(id)).toBe(true);
    // a backup whose logs come from ANOTHER device
    const foreign = validBackup({}, { reviewLogs: validBackup().data.reviewLogs.map((l) => ({ ...l, deviceId: 'another-device' })) });
    await importText(JSON.stringify(foreign));
    expect((await read()).reviewLogs.every((l) => l.deviceId === 'another-device')).toBe(true); // provenance kept
    await resetProgress({ backup: repos.backup });
    await resetSettings(repos.settings);
    await importText(PRODUCTION_V1_TEXT);
    expect(await repos.device.getDeviceId()).toBe(id);
    expect(await (repos as unknown as { device: { db: AppDatabase } }).device.db.count(STORES.deviceMeta)).toBe(1);
  });

  it('a missing record is repaired once and then stays the same', async () => {
    const db = (repos as unknown as { device: { db: AppDatabase } }).device.db;
    await db.delete(STORES.deviceMeta, SINGLETON_KEY);
    // NEW repository instances on the same database (no cache)
    const repo = new IndexedDbDeviceRepository(db, { newId: () => '11111111-1111-4111-8111-111111111111', now: () => 5 });
    expect(await repo.getDeviceId()).toBe('11111111-1111-4111-8111-111111111111');
    const again = new IndexedDbDeviceRepository(db, { newId: () => '22222222-2222-4222-8222-222222222222' });
    expect(await again.getDeviceId()).toBe('11111111-1111-4111-8111-111111111111');
    expect(await db.get(STORES.deviceMeta, SINGLETON_KEY)).toEqual({ deviceId: '11111111-1111-4111-8111-111111111111', createdAt: 5 });
  });
});

describe('UserSettings.updatedAt', () => {
  it('is stamped by every explicit save with the clock; the caller value is ignored; defaults are 0', async () => {
    const db = (repos as unknown as { settings: { db: AppDatabase } }).settings.db;
    const settings = new IndexedDbSettingsRepository(db, () => 1_234_567);
    await settings.save({ ...DEFAULT_USER_SETTINGS, updatedAt: 99 });
    expect((await settings.get())?.updatedAt).toBe(1_234_567);
    expect(DEFAULT_USER_SETTINGS.updatedAt).toBe(0);
  });
});
