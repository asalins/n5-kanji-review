import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openHome } from './helpers';
import { injectFailure, readDatabase, removeInjection, type DbSnapshot, type Injection } from './idb';

test.skip(({ viewport }) => viewport?.width !== 360, 'real-browser backup checks run once, on the 360 px phone');

async function review(page: Page, count: number, rating: RegExp): Promise<void> {
  await page.getByRole('button', { name: /Today's review/ }).tap();
  await page.getByRole('button', { name: /Start/ }).tap();
  for (let i = 0; i < count; i += 1) {
    await page.getByRole('button', { name: /Show answer/ }).tap();
    await page.getByRole('group', { name: /remember/i }).getByRole('button', { name: rating }).tap();
    await expect(page.getByText(`Card ${i + 2} of`)).toBeVisible(); // moves on only after the review is stored
  }
  await page.goto('/');
}

async function openSettings(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
  await page.getByRole('button', { name: /Settings/ }).tap();
  await expect(page.getByLabel(/New cards per day/)).toBeVisible();
}

async function setNewCards(page: Page, value: string): Promise<void> {
  await page.getByLabel(/New cards per day/).selectOption(value);
  await expect(page.getByText(/Saved/)).toBeVisible();
}

/** Real reviews + a real setting, then a real download of the backup file. */
async function makeBackup(page: Page): Promise<{ file: string; state: DbSnapshot }> {
  await openHome(page);
  await review(page, 3, /Good/);
  await openSettings(page);
  await setNewCards(page, '20');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export backup/ }).tap()]);
  expect(download.suggestedFilename()).toMatch(/^n5-kanji-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = readFileSync((await download.path())!, 'utf8');
  return { file, state: await readDatabase(page) };
}

async function chooseBackup(page: Page, text: string): Promise<void> {
  await page.getByLabel(/Import backup/).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}

async function confirmImport(page: Page): Promise<void> {
  const dialog = page.getByRole('alertdialog', { name: /Import this backup/ });
  await dialog.getByLabel(/I understand/).check();
  await dialog.getByRole('button', { name: /Replace my data/ }).tap();
}

const userData = (s: DbSnapshot) => ({
  reviewCards: s.reviewCards,
  reviewLogs: s.reviewLogs,
  studySessions: s.studySessions,
  userSettings: s.userSettings,
});

test('export -> reset -> import -> reload: the real IndexedDB is restored exactly', async ({ page }) => {
  const { file, state: exported } = await makeBackup(page);
  expect(exported.reviewLogs).toHaveLength(3);
  expect(exported.reviewCards.length).toBeGreaterThanOrEqual(3);

  await page.getByRole('button', { name: /Reset progress/ }).tap();
  await page.getByLabel(/I understand/).check();
  await page.getByRole('button', { name: /Delete/ }).tap();
  await expect(page.getByText(/Progress deleted/)).toBeVisible();
  const afterReset = await readDatabase(page);
  expect([afterReset.reviewCards, afterReset.reviewLogs, afterReset.studySessions]).toEqual([[], [], []]);
  expect(afterReset.userSettings).toEqual(exported.userSettings); // reset keeps settings
  expect(afterReset.kanjiCount).toBe(196); // and the dataset

  await chooseBackup(page, file);
  await confirmImport(page);
  await expect(page.getByText(/Backup restored/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
  const restored = await readDatabase(page);
  expect(userData(restored)).toEqual(userData(exported));
  expect([restored.kanjiCount, restored.contentMeta, restored.streakState]).toEqual([exported.kanjiCount, exported.contentMeta, exported.streakState]);
  await expect(page.locator('dt', { hasText: /Reviews today/ }).locator('xpath=..')).toContainText('3');
});

const INJECTIONS: readonly Injection[] = [
  { label: 'right after the stores were cleared (first card write)', store: 'reviewCards', method: 'add', nth: 1 },
  { label: 'after card #1', store: 'reviewCards', method: 'add', nth: 2 },
  { label: 'after several cards', store: 'reviewCards', method: 'add', nth: 4 },
  { label: 'on a review-log write', store: 'reviewLogs', method: 'add', nth: 2 },
  { label: 'on the settings write', store: 'userSettings', method: 'put', nth: 1 },
];

test('a failed import in the real browser leaves the database exactly as it was, at every failure point', async ({ page }) => {
  const { file } = await makeBackup(page);
  // move on from the backup so a partial restore would be visible: one more review and another setting
  await page.goto('/');
  await review(page, 1, /Again/);
  await openSettings(page);
  await setNewCards(page, '5');
  const before = await readDatabase(page);
  expect(before.reviewLogs).toHaveLength(4);

  for (const injection of INJECTIONS) {
    await test.step(injection.label, async () => {
      await injectFailure(page, injection);
      await chooseBackup(page, file);
      await confirmImport(page);
      await expect(page.getByRole('alert')).toContainText(/could not be saved/); // IMPORT_TRANSACTION_FAILED: the injection really fired
      await expect(page.getByRole('alert')).toContainText(/has not been changed/);
      await removeInjection(page);
      await page.reload();
      expect(await readDatabase(page)).toEqual(before);
      await openSettings(page);
    });
  }

  await test.step('a corrupt file', async () => {
    await chooseBackup(page, file.slice(0, file.length / 2));
    await expect(page.getByRole('alert')).toContainText(/not valid JSON/);
    expect(await readDatabase(page)).toEqual(before);
  });
});

test('a backup from another dataset version: mandatory warning, then an exact restore in the real browser', async ({ page }) => {
  const { file, state: exported } = await makeBackup(page);
  const older = JSON.stringify({ ...JSON.parse(file), datasetVersion: 'n5-2025.01.01' });
  await page.getByRole('button', { name: /Reset progress/ }).tap();
  await page.getByLabel(/I understand/).check();
  await page.getByRole('button', { name: /Delete/ }).tap();
  await expect(page.getByText(/Progress deleted/)).toBeVisible();

  await chooseBackup(page, older);
  const dialog = page.getByRole('alertdialog', { name: /Import this backup/ });
  await expect(dialog.getByRole('alert')).toContainText('n5-2025.01.01');
  await expect(dialog.getByRole('alert')).toContainText(/different dataset version/);
  await confirmImport(page);
  await expect(page.getByText(/Backup restored/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'N5 Kanji Review' })).toBeVisible();
  expect(userData(await readDatabase(page))).toEqual(userData(exported));
});

