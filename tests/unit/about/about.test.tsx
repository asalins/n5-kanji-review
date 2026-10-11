import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AboutScreen } from '../../../src/features/about/AboutScreen';
import { RepositoriesProvider } from '../../../src/hooks/useRepositories';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { openRealRepositories } from '../../helpers/realData';
import { CURRENT_DATASET_VERSION } from '../../helpers/currentDataset';

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
});
afterEach(() => dispose());

const show = (kanji = repos.kanji) =>
  render(
    <RepositoriesProvider value={{ kanji, review: repos.review }}>
      <AboutScreen onBack={() => undefined} />
    </RepositoriesProvider>,
  );

async function waitStatus(status: string, text: RegExp) {
  const el = await screen.findByTestId('storage-status');
  await waitFor(() => expect(el.getAttribute('data-status')).toBe(status));
  expect(el.textContent).toMatch(text);
}

describe('About & Sources: the acknowledgement required by the EDRDG licence', () => {
  it('names the source, its owners and the licence, says the app data is derived and shared alike, and claims no copyright', async () => {
    show();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/KANJIDIC2/);
    expect(text).toMatch(/Electronic Dictionary Research and Development Group \(EDRDG\)/);
    expect(text).toMatch(/copyright James William Breen and the EDRDG/);
    expect(text).toMatch(/CC BY-SA 4\.0/);
    expect(text).toMatch(/selected and transformed from KANJIDIC2 and is shared under the same CC BY-SA 4\.0 licence/);
    expect(text).toMatch(/claims no copyright over that data and is not endorsed by the EDRDG/);
    expect(text).toMatch(/not an official JLPT list/);
    expect(text).toMatch(/does not use JMdict/);
  });

  it('links to the licence statement, the KANJIDIC project and CC BY-SA 4.0', () => {
    show();
    const href = (name: RegExp) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href(/EDRDG licence statement/)).toBe('https://www.edrdg.org/edrdg/license.html');
    expect(href(/KANJIDIC Project/)).toBe('https://www.edrdg.org/wiki/index.php/KANJIDIC_Project');
    expect(href(/Creative Commons BY-SA 4.0/)).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows the dataset version loaded in the app', async () => {
    show();
    expect((await screen.findByText(CURRENT_DATASET_VERSION)).getAttribute('data-testid')).toBe('dataset-version');
  });

  it('shows whether this browser keeps the storage, and says progress stays on this device', async () => {
    const set = (persisted: (() => Promise<boolean>) | undefined) =>
      persisted === undefined
        ? delete (navigator as { storage?: unknown }).storage
        : Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted } });
    try {
      set(() => Promise.resolve(true));
      const first = show();
      expect(document.body.textContent).toMatch(/Progress is stored only in this browser/);
      await waitStatus('persistent', /Persistent/);
      first.unmount();
      set(() => Promise.resolve(false));
      const second = show();
      await waitStatus('not-persistent', /Not persistent/);
      second.unmount();
      set(undefined);
      show();
      await waitStatus('unsupported', /Not supported/);
    } finally {
      delete (navigator as { storage?: unknown }).storage;
    }
  });

  it('still shows the acknowledgement when the version cannot be read', async () => {
    const failing = Object.assign(Object.create(repos.kanji) as Repositories['kanji'], { getDatasetVersion: () => Promise.reject(new Error('x')) });
    show(failing);
    expect(await screen.findByText(/ไม่ทราบ · unknown/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/CC BY-SA 4\.0/);
  });
});
