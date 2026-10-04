import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { buildAppServices } from '../../../src/app/bootstrap';
import { App } from '../../../src/app/App';
import { SettingsProvider } from '../../../src/features/settings/SettingsProvider';
import { SettingsScreen } from '../../../src/features/settings/SettingsScreen';
import { RepositoriesProvider } from '../../../src/hooks/useRepositories';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { DEFAULT_USER_SETTINGS } from '../../../src/services/settings/defaults';
import { RepositoryError } from '../../../src/utils/errors';
import { sampleRecords, validBackup } from '../../helpers/backupFixtures';
import { openRealRepositories } from '../../helpers/realData';
import { storedCard } from '../../helpers/sessionFixtures';

let repos: Repositories;
let dispose: () => Promise<void>;
let downloads: { name: string; text: string }[];
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
  downloads = [];
  let lastBlob: Blob | null = null;
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      lastBlob = blob;
      return 'blob:test';
    },
    revokeObjectURL: () => undefined,
  }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const blob = lastBlob;
    if (blob !== null) void blob.text().then((text) => downloads.push({ name: this.download, text }));
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  await dispose();
});

const show = () =>
  render(
    <RepositoriesProvider value={buildAppServices(repos)}>
      <SettingsProvider>
        <SettingsScreen onExit={() => undefined} />
      </SettingsProvider>
    </RepositoriesProvider>,
  );
const chooseFile = (text: string, name = 'backup.json') => {
  const input = screen.getByLabelText(/Import backup/) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'application/json' })] } });
};
const seed = async () => {
  const { cards, logs, sessions } = sampleRecords();
  await repos.backup.replaceUserData({ reviewCards: cards.slice(0, 1), reviewLogs: logs.slice(0, 2), studySessions: sessions, userSettings: null });
};

describe('study limits and theme', () => {
  it('shows defaults, saves a new value through the repository and confirms it', async () => {
    show();
    const select = (await screen.findByLabelText(/New cards per day/)) as HTMLSelectElement;
    expect(select.value).toBe('10');
    expect((screen.getByLabelText(/Reviews per day/) as HTMLSelectElement).value).toBe('20');
    expect([...select.options].map((o) => o.value)).toEqual(['5', '10', '20', '30']);
    fireEvent.change(select, { target: { value: '30' } });
    expect(await screen.findByText(/Saved/)).toBeTruthy();
    expect((await repos.settings.get())?.dailyNewCards).toBe(30);
  });

  it('a failed save keeps the previous value and says so', async () => {
    vi.spyOn(repos.settings, 'save').mockRejectedValue(new RepositoryError('nope'));
    show();
    fireEvent.change(await screen.findByLabelText(/Reviews per day/), { target: { value: '100' } });
    expect(await screen.findByText(/Could not save/)).toBeTruthy();
    expect((screen.getByLabelText(/Reviews per day/) as HTMLSelectElement).value).toBe('20');
  });

  it('the saved theme is applied with the existing theme function', async () => {
    render(<App bootstrap={() => Promise.resolve(buildAppServices(repos))} />);
    fireEvent.click(await screen.findByRole('button', { name: /Settings/ }));
    fireEvent.change(await screen.findByLabelText(/Theme/), { target: { value: 'dark' } });
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    expect((await repos.settings.get())?.theme).toBe('dark');
  });
});

describe('export', () => {
  it('downloads a dated JSON backup that validates as format version 1', async () => {
    await seed();
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Export backup/ }));
    expect(await screen.findByText(/Backup file created/)).toBeTruthy();
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.name).toMatch(/^n5-kanji-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(downloads[0]!.text) as { formatVersion: number; data: { reviewLogs: unknown[] } };
    expect(file.formatVersion).toBe(1);
    expect(file.data.reviewLogs).toHaveLength(2);
  });
});

describe('import', () => {
  it('validates, shows a summary and replaces data only after explicit confirmation', async () => {
    await seed();
    show();
    chooseFile(JSON.stringify(validBackup()));
    const dialog = await screen.findByRole('alertdialog', { name: /Import this backup/ });
    expect(within(dialog).getByText(/will replace your current learning data/)).toBeTruthy();
    expect(within(dialog).getByText('n5-2026.10.01')).toBeTruthy();
    expect((await repos.backup.readUserData()).reviewCards).toHaveLength(1); // nothing written yet
    const confirm = within(dialog).getByRole('button', { name: /Replace my data/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText(/I understand/));
    fireEvent.click(confirm);
    expect(await screen.findByText(/Backup restored/)).toBeTruthy();
    expect((await repos.backup.readUserData()).reviewCards).toHaveLength(4);
    expect((screen.getByLabelText(/New cards per day/) as HTMLSelectElement).value).toBe('20'); // settings reloaded
  });

  it('a backup from another dataset version shows the mandatory warning before confirmation, then restores', async () => {
    await seed();
    show();
    chooseFile(JSON.stringify(validBackup({ datasetVersion: 'n5-2025.01.01' })));
    const dialog = await screen.findByRole('alertdialog', { name: /Import this backup/ });
    const warning = within(dialog).getByRole('alert');
    expect(warning.textContent).toMatch(/different dataset version \(n5-2025\.01\.01; current n5-2026\.10\.01\)/);
    fireEvent.click(within(dialog).getByLabelText(/I understand/));
    fireEvent.click(within(dialog).getByRole('button', { name: /Replace my data/ }));
    expect(await screen.findByText(/Backup restored/)).toBeTruthy();
    expect((await repos.backup.readUserData()).reviewCards).toHaveLength(4);
  });

  it('the same dataset version shows no dataset warning', async () => {
    show();
    chooseFile(JSON.stringify(validBackup()));
    const dialog = await screen.findByRole('alertdialog', { name: /Import this backup/ });
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('cancel writes nothing', async () => {
    await seed();
    show();
    chooseFile(JSON.stringify(validBackup()));
    fireEvent.click(await screen.findByRole('button', { name: /Cancel/ }));
    expect((await repos.backup.readUserData()).reviewCards).toHaveLength(1);
  });

  it.each([
    ['not JSON', '<html>', /not valid JSON/],
    ['another app', JSON.stringify({ hello: 1 }), /not a backup of this application/],
    ['a kanji not in the current dataset', JSON.stringify(validBackup({ datasetVersion: 'n5-1999.01.01' }, { reviewCards: [...validBackup().data.reviewCards, storedCard('龍', 'A', { state: 'REVIEW', reviewCount: 1 })] })), /not in the current dataset/],
    ['invalid data', JSON.stringify(validBackup({}, { reviewLogs: [{ ...validBackup().data.reviewLogs[0]!, rating: 'MAYBE' as never }] })), /invalid learning data/],
  ])('%s: a safe message, no raw error, and the data is unchanged', async (_label, text, message) => {
    await seed();
    show();
    chooseFile(text);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(message);
    expect(alert.textContent).toMatch(/has not been changed/);
    expect(alert.textContent).not.toMatch(/ZodError|SyntaxError|Unexpected token/);
    expect((await repos.backup.readUserData()).reviewCards).toHaveLength(1);
  });
});

describe('reset', () => {
  it('reset progress needs the warning to be acknowledged, then deletes progress only', async () => {
    await seed();
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, dailyNewCards: 5 });
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Reset progress/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/permanently delete your learning progress/);
    const confirm = within(dialog).getByRole('button', { name: /Delete/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText(/I understand/));
    fireEvent.click(confirm);
    expect(await screen.findByText(/Progress deleted/)).toBeTruthy();
    expect((await repos.backup.readUserData()).reviewCards).toEqual([]);
    expect((await repos.settings.get())?.dailyNewCards).toBe(5);
  });

  it('reset settings goes back to 10 / 20 after confirmation and keeps progress', async () => {
    await seed();
    await repos.settings.save({ ...DEFAULT_USER_SETTINGS, dailyNewCards: 30 });
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Reset settings/ }));
    fireEvent.click(screen.getByLabelText(/I understand/));
    fireEvent.click(screen.getByRole('button', { name: /^คืนค่า · Reset$/ }));
    expect(await screen.findByText(/Settings reset/)).toBeTruthy();
    expect(await repos.settings.get()).toEqual(DEFAULT_USER_SETTINGS);
    expect((screen.getByLabelText(/New cards per day/) as HTMLSelectElement).value).toBe('10');
    expect((await repos.backup.readUserData()).reviewCards).toHaveLength(1);
  });
});

describe('after import the other screens show the new data (no page reload)', () => {
  it('the home dashboard counts the restored reviews when it is opened again', async () => {
    render(<App bootstrap={() => Promise.resolve(buildAppServices(repos))} />);
    fireEvent.click(await screen.findByRole('button', { name: /Settings/ }));
    chooseFile(JSON.stringify(validBackup()));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByLabelText(/I understand/));
    fireEvent.click(within(dialog).getByRole('button', { name: /Replace my data/ }));
    await screen.findByText(/Backup restored/);
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    const learned = await screen.findByRole('progressbar', { name: /Learned/ });
    expect(learned.getAttribute('aria-valuetext')).toContain('2 / 196'); // 水 and 火 from the backup
  });
});
