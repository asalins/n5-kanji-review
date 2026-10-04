import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { buildAppServices } from '../../../src/app/bootstrap';
import { SettingsProvider, useSettings } from '../../../src/features/settings/SettingsProvider';
import { RepositoriesProvider, type AppRepositories } from '../../../src/hooks/useRepositories';
import { HomePage } from '../../../src/pages/HomePage';
import { ReviewPage } from '../../../src/pages/ReviewPage';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { DEFAULT_USER_SETTINGS, NEW_CARD_OPTIONS, REVIEW_LIMIT_OPTIONS } from '../../../src/services/settings/defaults';
import { isValidSettings, limitsFromSettings, validateSettings } from '../../../src/services/settings/settingsRules';
import { RepositoryError, ValidationError } from '../../../src/utils/errors';
import { openRealRepositories } from '../../helpers/realData';

describe('settings rules', () => {
  it('approved defaults: 10 new / 20 reviews / system theme', () => {
    expect(DEFAULT_USER_SETTINGS).toEqual({ dailyNewCards: 10, dailyReviewLimit: 20, theme: 'system', uiLanguage: 'th', soundEnabled: false, autoPlay: false, studyMode: 'A', animationsEnabled: true });
    expect(isValidSettings(DEFAULT_USER_SETTINGS)).toBe(true);
  });
  it.each(NEW_CARD_OPTIONS)('new cards %i is allowed', (n) => expect(isValidSettings({ ...DEFAULT_USER_SETTINGS, dailyNewCards: n })).toBe(true));
  it.each(REVIEW_LIMIT_OPTIONS)('reviews %i is allowed', (n) => expect(isValidSettings({ ...DEFAULT_USER_SETTINGS, dailyReviewLimit: n })).toBe(true));
  it.each([0, -5, 4, 7, 31, 1000, Number.NaN, Number.POSITIVE_INFINITY, 10.5])('new cards %s is rejected', (n) => {
    expect(() => validateSettings({ ...DEFAULT_USER_SETTINGS, dailyNewCards: n })).toThrow(ValidationError);
  });
  it.each([0, 9, 21, 101, -20, Number.NaN, Number.POSITIVE_INFINITY])('reviews %s is rejected', (n) => {
    expect(isValidSettings({ ...DEFAULT_USER_SETTINGS, dailyReviewLimit: n })).toBe(false);
  });
  it('rejects unknown theme / language and missing fields', () => {
    expect(isValidSettings({ ...DEFAULT_USER_SETTINGS, theme: 'blue' })).toBe(false);
    expect(isValidSettings({ ...DEFAULT_USER_SETTINGS, uiLanguage: 'fr' })).toBe(false);
    const { theme: _theme, ...missing } = DEFAULT_USER_SETTINGS;
    expect(isValidSettings(missing)).toBe(false);
  });
  it('maps the persisted dailyNewCards onto the session limits (no new field)', () => {
    expect(limitsFromSettings({ ...DEFAULT_USER_SETTINGS, dailyNewCards: 5, dailyReviewLimit: 100 })).toEqual({ newCards: 5, reviews: 100 });
  });
});

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await dispose();
});

function Probe() {
  const { status, settings, saved, limits } = useSettings();
  return <p data-testid="probe">{JSON.stringify({ status, saved, newCards: settings.dailyNewCards, limits })}</p>;
}
/** Mirrors App: pages render only after the saved settings are read, so a session plans once, with them. */
function AfterSettings({ children }: { children: React.ReactNode }) {
  const { status } = useSettings();
  return status === 'LOADING' ? null : <>{children}</>;
}
const probe = () => JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as { status: string; saved: boolean; newCards: number; limits: { newCards: number; reviews: number } };
const withSettings = (value: AppRepositories, child = <Probe />) =>
  render(
    <RepositoriesProvider value={value}>
      <SettingsProvider>{child}</SettingsProvider>
    </RepositoriesProvider>,
  );

describe('settings persistence', () => {
  it('nothing saved: defaults in memory, and nothing is written', async () => {
    const save = vi.spyOn(repos.settings, 'save');
    withSettings(buildAppServices(repos));
    await waitFor(() => expect(probe().status).toBe('READY'));
    expect(probe()).toMatchObject({ saved: false, newCards: 10, limits: { newCards: 10, reviews: 20 } });
    expect(save).not.toHaveBeenCalled();
    expect(await repos.settings.get()).toBeNull();
  });

  it('existing settings are loaded and never overwritten by defaults', async () => {
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, dailyNewCards: 30, dailyReviewLimit: 100 });
    withSettings(buildAppServices(repos));
    await waitFor(() => expect(probe().status).toBe('READY'));
    expect(probe()).toMatchObject({ saved: true, newCards: 30, limits: { newCards: 30, reviews: 100 } });
    expect((await repos.settings.get())?.dailyNewCards).toBe(30);
  });

  it('a read error keeps the app usable with the defaults and reports ERROR (nothing written)', async () => {
    vi.spyOn(repos.settings, 'get').mockRejectedValue(new RepositoryError('boom'));
    const save = vi.spyOn(repos.settings, 'save');
    withSettings(buildAppServices(repos));
    await waitFor(() => expect(probe().status).toBe('ERROR'));
    expect(probe()).toMatchObject({ saved: false, limits: { newCards: 10, reviews: 20 } });
    expect(save).not.toHaveBeenCalled();
  });

  it('saved limits reach the review session (dailyNewCards -> newCards)', async () => {
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, dailyNewCards: 5 });
    withSettings(buildAppServices(repos), <AfterSettings><ReviewPage onExit={() => undefined} /></AfterSettings>);
    expect(await screen.findByText('5 ใบในรอบนี้')).toBeTruthy();
  });

  it('saved limits reach the dashboard quota display', async () => {
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, dailyNewCards: 30, dailyReviewLimit: 50 });
    withSettings(buildAppServices(repos), <AfterSettings><HomePage onStartReview={() => undefined} onStartPractice={() => undefined} onSearch={() => undefined} onSettings={() => undefined} /></AfterSettings>);
    expect(await screen.findByText('0 / 30')).toBeTruthy();
    expect(screen.getByText('0 / 50')).toBeTruthy();
  });
});
