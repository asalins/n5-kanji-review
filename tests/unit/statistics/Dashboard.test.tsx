import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StatisticsProbe } from './StatisticsProbe';
import { RepositoriesProvider, type AppRepositories } from '../../../src/hooks/useRepositories';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { RepositoryError } from '../../../src/utils/errors';
import { openRealRepositories } from '../../helpers/realData';
import { NOON, logAt, storedCard } from '../../helpers/sessionFixtures';

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
});
afterEach(() => dispose());

const app = (over: Partial<Repositories['review']> = {}): AppRepositories => ({
  kanji: repos.kanji,
  review: Object.assign(Object.create(repos.review) as Repositories['review'], over),
});
const show = (value: AppRepositories) =>
  render(
    <RepositoriesProvider value={value}>
      <StatisticsProbe now={() => NOON} />
    </RepositoriesProvider>,
  );
const stat = (label: RegExp): HTMLElement => {
  const term = screen.getByText(label, { selector: 'dt' });
  return term.parentElement as HTMLElement;
};

describe('dashboard with no data: zeros, a dash for accuracy, an honest empty history', () => {
  it('shows Reviews 0, Accuracy —, Learned 0 / 196, Streak 0 and "No review history yet"', async () => {
    show(app());
    expect(await screen.findByRole('heading', { name: 'วันนี้ · Today' })).toBeTruthy();
    expect(within(stat(/Reviews today/)).getByText('0')).toBeTruthy();
    expect(within(stat(/Accuracy/)).getByText('—')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getByRole('progressbar', { name: /Learned/ }).getAttribute('aria-valuetext')).toContain('0 / 196');
    expect(within(stat(/Current/)).getByText('0 วัน · days')).toBeTruthy();
    expect(screen.getByText('ยังไม่มีประวัติการเรียน · No review history yet')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /History/ })).toBeNull(); // no chart without data
  });
});

describe('dashboard with real data', () => {
  beforeEach(async () => {
    await repos.review.appendLog(logAt(1, NOON - 1_000, 'NEW', { rating: 'GOOD' }));
    await repos.review.appendLog(logAt(2, NOON - 2_000, 'LEARNING', { rating: 'AGAIN' }));
    await repos.review.appendLog(logAt(3, NOON - 3_000, 'REVIEW', { rating: 'EASY' }));
    for (const mode of ['A', 'B', 'C', 'D'] as const) await repos.review.saveCard(storedCard('水', mode, { state: 'MASTERED', reviewCount: 9, due: NOON + 86_400_000 }));
    await repos.review.saveCard(storedCard('火', 'A', { state: 'LEARNING', reviewCount: 1, due: NOON - 1 }));
  });

  it('keeps reviews today, review quota and new cards as three separate numbers (never 3 / 20)', async () => {
    show(app());
    await screen.findByRole('heading', { name: 'วันนี้ · Today' });
    expect(within(stat(/Reviews today/)).getByText('3')).toBeTruthy();
    expect(within(stat(/Review quota/)).getByText('2 / 20')).toBeTruthy();
    expect(within(stat(/New cards/)).getByText('1 / 10')).toBeTruthy();
    expect(screen.queryByText('3 / 20')).toBeNull();
    expect(within(stat(/Accuracy/)).getByText('67%')).toBeTruthy();
  });

  it('shows Learned and Mastered as Kanji, cards by state as "Review Cards", queue and streak', async () => {
    show(app());
    await screen.findByRole('heading', { name: 'วันนี้ · Today' });
    expect(screen.getByRole('progressbar', { name: /Learned/ }).getAttribute('aria-valuetext')).toContain('2 / 196');
    expect(screen.getByRole('progressbar', { name: /Mastered/ }).getAttribute('aria-valuetext')).toContain('1 / 196');
    expect(screen.getByText('การ์ดทบทวนแยกตามสถานะ · Review Cards by state')).toBeTruthy();
    expect(screen.getByText('MASTERED · ชำนาญ').parentElement?.textContent).toContain('4');
    expect(within(stat(/Due/)).getByText('1')).toBeTruthy();
    expect(screen.getByText(/✓ วันนี้เรียนแล้ว/)).toBeTruthy();
  });

  it('history: 7 / 30 day toggle, an accessible table, and period summary rows', async () => {
    show(app());
    await screen.findByRole('heading', { name: 'วันนี้ · Today' });
    const sevenDays = screen.getByRole('button', { name: '7 วัน · 7 days' });
    expect(sevenDays.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '30 วัน · 30 days' }));
    expect(screen.getByRole('button', { name: '30 วัน · 30 days' }).getAttribute('aria-pressed')).toBe('true');
    const table = screen.getAllByRole('table', { hidden: true }).find((t) => t.querySelector('caption')?.textContent === '30 วัน · 30 days') as HTMLElement;
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(31); // header + 30 days
    expect(screen.getByRole('row', { name: /ทั้งหมด · All time 3 2 1 67%/ })).toBeTruthy();
  });
});

describe('dashboard states', () => {
  it('shows a loading status first', () => {
    show(app());
    expect(screen.getByRole('status').textContent).toContain('Loading');
  });

  it('shows a friendly error, no numbers and no raw exception, when a repository fails; retry reloads', async () => {
    let fail = true;
    show(app({ getLogs: (range) => (fail ? Promise.reject(new RepositoryError('IDB boom')) : repos.review.getLogs(range)) }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('โหลดสถิติไม่สำเร็จ');
    expect(alert.textContent).not.toContain('IDB boom');
    expect(screen.queryByRole('heading', { name: 'วันนี้ · Today' })).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
    expect(await screen.findByRole('heading', { name: 'วันนี้ · Today' })).toBeTruthy();
  });

  it('a missing dataset is an error, not "0 of 0"', async () => {
    const empty = { ...app(), kanji: Object.assign(Object.create(repos.kanji) as Repositories['kanji'], { getByLevel: () => Promise.resolve([]) }) };
    show(empty);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
