import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { openAppDatabase } from '../../../src/services/storage/database';
import { APP_MIGRATIONS } from '../../../src/services/storage/migrations';
import { StorageError } from '../../../src/utils/errors';
import { isNewerDatabaseError, toUserMessage } from '../../../src/utils/userMessage';
import { uniqueDatabaseName } from '../../helpers/testDatabase';

// R-1 / D3: an older build opening a database a newer build has already upgraded (IndexedDB VersionError).
const OLDER_BUILD = APP_MIGRATIONS.filter((m) => m.version < Math.max(...APP_MIGRATIONS.map((x) => x.version)));

const names: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(names.splice(0).map((name) => deleteDB(name)));
});

describe('a database written by a newer build (VersionError)', () => {
  it('is reported as such, tells the user to reopen the latest version and never to clear site data', async () => {
    const name = uniqueDatabaseName();
    names.push(name);
    (await openAppDatabase(APP_MIGRATIONS, name)).close();

    const error = await openAppDatabase(OLDER_BUILD, name).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(StorageError);
    expect(isNewerDatabaseError(error)).toBe(true);
    const text = toUserMessage(error);
    expect(text).toContain('ข้อมูลของคุณยังอยู่');
    expect(text).toContain('อย่าล้างข้อมูลเว็บไซต์');
    expect(text).toContain('Do not clear site data');
    expect(text).not.toContain('พื้นที่ว่าง');
    expect(text).not.toMatch(/rollback|ย้อน/i); // the cause is a newer database, nothing more is claimed

    // The data is untouched: the newer build still opens it at its own version.
    const again = await openAppDatabase(APP_MIGRATIONS, name);
    expect(again.version).toBe(Math.max(...APP_MIGRATIONS.map((m) => m.version)));
    again.close();
  });

  it('other storage failures keep the general message', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const error = await openAppDatabase(APP_MIGRATIONS, uniqueDatabaseName()).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(StorageError);
    expect(isNewerDatabaseError(error)).toBe(false);
    expect(toUserMessage(error)).toBe('ไม่สามารถเปิดที่เก็บข้อมูลในเบราว์เซอร์ได้ (ลองปิดโหมดส่วนตัว หรือตรวจพื้นที่ว่าง)');
  });

  it('only a StorageError whose cause is named VersionError counts', () => {
    expect(isNewerDatabaseError(new StorageError('x', { cause: { name: 'VersionError' } }))).toBe(true);
    expect(isNewerDatabaseError(new StorageError('x', { cause: new Error('quota') }))).toBe(false);
    expect(isNewerDatabaseError(new StorageError('x'))).toBe(false);
    expect(isNewerDatabaseError(Object.assign(new Error('x'), { cause: { name: 'VersionError' } }))).toBe(false);
  });
});
