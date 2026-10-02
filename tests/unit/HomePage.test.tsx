import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/app/App';
import type { AppRepositories } from '../../src/hooks/useRepositories';

const emptyRepositories: AppRepositories = {
  kanji: {
    getById: () => Promise.resolve(null),
    getByLevel: () => Promise.resolve([]),
    search: () => Promise.resolve([]),
    getDatasetVersion: () => Promise.resolve(null),
    getReadings: () => Promise.resolve([]),
    getVocabulary: () => Promise.resolve([]),
    getExamples: () => Promise.resolve([]),
  },
  review: {} as AppRepositories['review'],
};

describe('App', () => {
  it('starts and renders the home page once the bootstrap finishes', async () => {
    render(<App bootstrap={() => Promise.resolve(emptyRepositories)} />);
    expect(await screen.findByRole('heading', { name: 'N5 Kanji Review' })).toBeTruthy();
  });

  it('shows a friendly, retryable error (no raw exception text) when startup fails', async () => {
    render(<App bootstrap={() => Promise.reject(new Error('secret db internals'))} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('secret db internals');
    expect(screen.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeTruthy();
  });
});
