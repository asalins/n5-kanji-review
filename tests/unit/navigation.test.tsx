import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../../src/app/App';
import { buildAppServices } from '../../src/app/bootstrap';
import type { PwaUpdate } from '../../src/app/pwaUpdate';
import type { Repositories } from '../../src/repositories/indexeddb';
import { openRealRepositories } from '../helpers/realData';

const noUpdate = (): PwaUpdate => ({ updateReady: false, applyUpdate: () => undefined, dismiss: () => undefined });
let repos: Repositories;
let dispose: () => Promise<void>;
let pushes: MockInstance;
let backs: MockInstance;
beforeEach(async () => {
  window.history.replaceState(null, '');
  pushes = vi.spyOn(window.history, 'pushState');
  backs = vi.spyOn(window.history, 'back');
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await dispose();
});

const home = () => screen.findByRole('heading', { name: 'N5 Kanji Review' });
const ourState = () => (window.history.state as { n5Screen?: string } | null)?.n5Screen ?? null;
// jsdom shares one history across tests (forward entries linger), so entries are counted by the calls made.
async function start() {
  render(<App bootstrap={() => Promise.resolve(buildAppServices(repos))} useUpdate={noUpdate} />);
  await home();
  pushes.mockClear();
  backs.mockClear();
}
async function systemBack() {
  window.history.back();
  await home();
  expect(ourState()).toBeNull();
}

describe('Simple Home boundary (system / browser Back)', () => {
  it.each([
    [/Today's review/, 'review'],
    [/Search/, 'search'],
    [/Settings/, 'settings'],
    [/Practice/, 'practice'],
  ])('Home -> %s -> Back -> Home, with exactly one history entry while away', async (button, name) => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(ourState()).toBe(name);
    expect(pushes).toHaveBeenCalledTimes(1);
    await systemBack();
  });

  it('Home -> Settings -> About replaces the entry; Back goes Home', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Sources & licences/ }));
    expect(await screen.findByRole('heading', { name: /About & Sources/ })).toBeTruthy();
    expect(ourState()).toBe('about');
    expect(pushes).toHaveBeenCalledTimes(1); // Settings -> About replaced the entry
    await systemBack();
  });

  it('the in-app button on About returns to Settings without adding history', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Sources & licences/ }));
    fireEvent.click(await screen.findByRole('button', { name: /← ตั้งค่า/ }));
    expect(await screen.findByLabelText(/New cards per day/)).toBeTruthy();
    expect(ourState()).toBe('settings');
    expect(pushes).toHaveBeenCalledTimes(1);
  });

  it('in-app Back buttons go Home through history, so the stack never grows', async () => {
    await start();
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Search/ }));
      fireEvent.click(await screen.findByRole('button', { name: /กลับ|Back/ }));
      await home();
      expect(ourState()).toBeNull();
    }
    // every entry the app pushed was taken off again by the in-app Back: nothing piles up
    expect(pushes).toHaveBeenCalledTimes(5);
    expect(backs).toHaveBeenCalledTimes(5);
  });

  it('a stale marker from a previous load (reload / update) is cleared: the app starts at Home', async () => {
    window.history.replaceState({ n5Screen: 'review' }, '');
    await start();
    expect(ourState()).toBeNull();
  });

  it('Back while already at Home is left to the system (nothing is pushed)', async () => {
    await start();
    await waitFor(() => expect(ourState()).toBeNull());
    expect(pushes).not.toHaveBeenCalled();
  });
});

describe('Phase 13: Search -> Kanji detail -> Back keeps the search context', () => {
  async function openDetailFromSearch() {
    await start();
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    const input = (await screen.findByLabelText(/ค้นหา · Search/)) as HTMLInputElement;
    await screen.findByText(/196/);
    fireEvent.change(input, { target: { value: 'mizu' } });
    fireEvent.click(await screen.findByRole('button', { name: /Details 水/ }));
    await screen.findByRole('heading', { name: /Kanji detail/ });
  }
  const searchInput = () => document.querySelector<HTMLInputElement>('#kanji-search-input');

  it('Search -> Detail is a push (second entry); system Back returns to Search with the query intact', async () => {
    await openDetailFromSearch();
    expect(ourState()).toBe('detail');
    expect(pushes).toHaveBeenCalledTimes(2); // Home -> Search, Search -> Detail
    expect(screen.queryByRole('heading', { name: /Search Kanji/ })).toBeNull(); // search hidden, still mounted
    window.history.back();
    expect(await screen.findByRole('heading', { name: /Search Kanji/ })).toBeTruthy();
    expect(searchInput()?.value).toBe('mizu');
    expect(screen.queryByRole('heading', { name: /Kanji detail/ })).toBeNull();
    expect(ourState()).toBe('search');
  });

  it('the in-app Back on the detail does the same through history', async () => {
    await openDetailFromSearch();
    fireEvent.click(screen.getByRole('button', { name: /← ค้นหา · Search/ }));
    expect(await screen.findByRole('heading', { name: /Search Kanji/ })).toBeTruthy();
    expect(searchInput()?.value).toBe('mizu');
    expect(backs).toHaveBeenCalledTimes(1);
  });

  it('opening and closing the detail many times does not pile up history', async () => {
    await openDetailFromSearch();
    window.history.back();
    await screen.findByRole('heading', { name: /Search Kanji/ });
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(await screen.findByRole('button', { name: /Details 水/ }));
      await screen.findByRole('heading', { name: /Kanji detail/ });
      fireEvent.click(screen.getByRole('button', { name: /← ค้นหา · Search/ }));
      await screen.findByRole('heading', { name: /Search Kanji/ });
    }
    // every push after "Home -> Search" is matched by exactly one back (the first one is the test's own system Back)
    expect(pushes).toHaveBeenCalledTimes(1 + 5);
    expect(backs).toHaveBeenCalledTimes(5);
    expect(ourState()).toBe('search');
  });

  it('Back from Search after a detail still goes Home', async () => {
    await openDetailFromSearch();
    window.history.back();
    await screen.findByRole('heading', { name: /Search Kanji/ });
    window.history.back();
    await home();
    expect(ourState()).toBeNull();
  });

  it('accepted edge case: reload on the detail starts on Home; the older "search" entry then opens Search on Back', async () => {
    window.history.replaceState({ n5Screen: 'detail', kanjiId: 'kanji:U+6C34' }, '');
    await start();
    expect(ourState()).toBeNull(); // the current entry's marker is cleared
    window.dispatchEvent(new PopStateEvent('popstate', { state: { n5Screen: 'search' } }));
    expect(await screen.findByRole('heading', { name: /Search Kanji/ })).toBeTruthy();
  });

  it('a detail marker without a valid kanji id falls back to Search', async () => {
    await start();
    window.dispatchEvent(new PopStateEvent('popstate', { state: { n5Screen: 'detail', kanjiId: 'not-a-kanji' } }));
    expect(await screen.findByRole('heading', { name: /Search Kanji/ })).toBeTruthy();
  });
});

