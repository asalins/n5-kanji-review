import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KanjiSearch } from '../../../src/features/kanji/KanjiSearch';
import { ResultCard } from '../../../src/features/kanji/ResultCard';
import { RepositoriesProvider, type AppRepositories } from '../../../src/hooks/useRepositories';
import { createIndexedDbRepositories, type Repositories } from '../../../src/repositories/indexeddb';
import { loadDatasetContent } from '../../../src/services/content/loadDataset';
import { loadSearchCorpus } from '../../../src/services/kanjiSearch/loadSearchCorpus';
import { buildSearchIndex, searchKanji } from '../../../src/services/kanjiSearch/searchKanji';
import { DatasetUnavailableError } from '../../../src/services/session/sessionEngine';
import { RepositoryError } from '../../../src/utils/errors';
import { makeKanjiId } from '../../../src/utils/kanjiId';
import { makeDataset } from '../../helpers/datasetFixtures';
import { openRealRepositories } from '../../helpers/realData';
import { NOON, realProjectList, storedCard } from '../../helpers/sessionFixtures';
import { openTestDatabase } from '../../helpers/testDatabase';
import { SearchProbe } from './SearchProbe';
import { approvedThai } from '../../helpers/thaiState';

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

const deps = () => ({ kanji: repos.kanji, review: repos.review, newItems: realProjectList });
const chars = async (text: string, over: Partial<Parameters<typeof searchKanji>[1]> = {}, now = NOON) =>
  searchKanji(buildSearchIndex(await loadSearchCorpus(deps())), { text, state: 'ALL', dueOnly: false, ...over }, now).map((h) => h.entry.kanji.character);

describe('real dataset search (196 kanji, real readings)', () => {
  it('finds 水 by kanji, English, romaji and kana (hiragana kun and katakana on)', async () => {
    expect((await chars('水'))[0]).toBe('水');
    expect(await chars('water')).toContain('水');
    expect(await chars('mizu')).toContain('水');
    expect(await chars('MIZU')).toEqual(await chars('mizu'));
    expect(await chars('みず')).toContain('水');
    expect(await chars('すい')).toContain('水');
  });
  it('finds 学 / 日 / 一 by their readings, including notation (ひとつ -> ひと.つ)', async () => {
    expect(await chars('gaku')).toContain('学');
    expect(await chars('nichi')).toContain('日');
    expect(await chars('ひとつ')).toContain('一');
  });
  it('partial English works on the real meanings', async () => {
    expect(await chars('wat')).toContain('水');
    expect(await chars('school')).toContain('校');
  });
  it('an empty query lists all 196 in Project N5 order (一 first, 薬 last), once each', async () => {
    const all = await chars('');
    expect(all).toHaveLength(196);
    expect(new Set(all).size).toBe(196);
    expect([all[0], all[1], all[2], all[195]]).toEqual(['一', '二', '三', '薬']);
  });
  it('no match is an empty list, and the order is the same on every run', async () => {
    expect(await chars('qqqqzzz')).toEqual([]);
    expect(await chars('i')).toEqual(await chars('i'));
  });
  it('a reading without romaji (十 ジッ) is searchable by kana', async () => {
    expect(await chars('ジッ')).toContain('十');
    expect(await chars('じっ')).toContain('十');
  });
});

describe('Thai: only reviewed Thai exists in the search data', () => {
  it('a reviewed Thai meaning is searchable; a draft (reviewed: false) is not', async () => {
    const opened = await openTestDatabase();
    try {
      const r2 = createIndexedDbRepositories(opened.db);
      const dataset = makeDataset('v-th', [['水', '6C34', 'water'], ['火', '706B', 'fire']]);
      const thai = {
        datasetVersion: 'v-th',
        entries: [
          { kanjiId: 'kanji:U+6C34', meaningsTh: ['น้ำ'], reviewed: true, ambiguous: false },
          { kanjiId: 'kanji:U+706B', meaningsTh: ['ไฟ'], reviewed: false, ambiguous: false },
        ],
      };
      await loadDatasetContent({ writer: r2.contentWriter, reader: r2.kanji, now: () => 1 }, dataset, thai);
      const index = buildSearchIndex(await loadSearchCorpus({ kanji: r2.kanji, review: r2.review }));
      const find = (text: string) => searchKanji(index, { text, state: 'ALL', dueOnly: false }, NOON).map((h) => h.entry.kanji.character);
      expect(find('น้ำ')).toEqual(['水']);
      expect(find('ไฟ')).toEqual([]);
    } finally {
      await opened.dispose();
    }
  });
});

describe('corpus loading: fixed number of reads, read-only, honest errors', () => {
  it('reads kanji, readings, cards and list order once each: no per-kanji query', async () => {
    const getByLevel = vi.spyOn(repos.kanji, 'getByLevel');
    const getAllReadings = vi.spyOn(repos.kanji, 'getAllReadings');
    const getCardsByStates = vi.spyOn(repos.review, 'getCardsByStates');
    const getReadings = vi.spyOn(repos.kanji, 'getReadings');
    const getById = vi.spyOn(repos.kanji, 'getById');
    const getCard = vi.spyOn(repos.review, 'getCard');
    const getDue = vi.spyOn(repos.review, 'getDueCards');
    await loadSearchCorpus(deps());
    expect([getByLevel.mock.calls.length, getAllReadings.mock.calls.length, getCardsByStates.mock.calls.length]).toEqual([1, 1, 1]);
    expect([getReadings, getById, getCard, getDue].map((s) => s.mock.calls.length)).toEqual([0, 0, 0, 0]);
  });
  it('typing and filtering never touch a repository after the load', async () => {
    const index = buildSearchIndex(await loadSearchCorpus(deps()));
    const spies = [vi.spyOn(repos.kanji, 'getByLevel'), vi.spyOn(repos.kanji, 'getAllReadings'), vi.spyOn(repos.review, 'getCardsByStates')];
    for (const text of ['w', 'wa', 'wat', 'water']) searchKanji(index, { text, state: 'REVIEW', dueOnly: true }, NOON);
    expect(spies.map((s) => s.mock.calls.length)).toEqual([0, 0, 0]);
  });
  it('writes nothing', async () => {
    const writes = [vi.spyOn(repos.review, 'saveCard'), vi.spyOn(repos.review, 'appendLog'), vi.spyOn(repos.review, 'recordReview'), vi.spyOn(repos.review, 'saveSession')];
    await loadSearchCorpus(deps());
    expect(writes.map((w) => w.mock.calls.length)).toEqual([0, 0, 0, 0]);
  });
  it('uses the card states of the review repository', async () => {
    for (const mode of ['A', 'B', 'C', 'D'] as const) await repos.review.saveCard(storedCard('水', mode, { state: 'MASTERED', reviewCount: 9, due: NOON + 1 }));
    expect(await chars('', { state: 'MASTERED' })).toEqual(['水']);
  });
  it('a missing dataset is an error, never "no results"', async () => {
    const empty = Object.assign(Object.create(repos.kanji) as Repositories['kanji'], { getByLevel: () => Promise.resolve([]) });
    await expect(loadSearchCorpus({ ...deps(), kanji: empty })).rejects.toBeInstanceOf(DatasetUnavailableError);
  });
  it('a failing repository rejects instead of returning an empty corpus', async () => {
    vi.spyOn(repos.review, 'getCardsByStates').mockRejectedValue(new RepositoryError('boom'));
    await expect(loadSearchCorpus(deps())).rejects.toBeInstanceOf(RepositoryError);
  });
  it('getAllReadings returns every reading once, sorted, with null romaji kept', async () => {
    const all = await repos.kanji.getAllReadings();
    expect(all).toHaveLength(810);
    expect(all.filter((x) => x.romaji === null)).toHaveLength(3);
    expect(all.map((x) => `${x.kanjiId}|${x.type}|${x.kana}`)).toEqual([...all.map((x) => `${x.kanjiId}|${x.type}|${x.kana}`)].sort((a, b) => a.localeCompare(b)));
  });
});

describe('Due now never goes stale: the clock is read again on open, on typing/filtering, and on focus/visibility', () => {
  const mutableClock = () => {
    let t = NOON;
    return { now: () => t, set: (v: number) => (t = v) };
  };
  const renderProbe = (clock: { now: () => number }) =>
    render(
      <RepositoriesProvider value={{ kanji: repos.kanji, review: repos.review, newItems: realProjectList }}>
        <SearchProbe now={clock.now} />
      </RepositoriesProvider>,
    );
  const hitsText = () => screen.getByTestId('hits').textContent ?? '';

  beforeEach(async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW', reviewCount: 2, due: NOON + 60_000 })); // due one minute from "now"
  });

  it('the clock reading at open decides; typing refreshes it', async () => {
    const clock = mutableClock();
    renderProbe(clock);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('READY'));
    fireEvent.click(screen.getByText('toggle-due'));
    expect(hitsText()).toBe(''); // not due yet
    clock.set(NOON + 61_000);
    fireEvent.change(screen.getByLabelText('q'), { target: { value: 'water' } }); // typing re-reads the clock
    expect(hitsText()).toBe('水*');
  });
  it('changing a filter refreshes the clock', async () => {
    const clock = mutableClock();
    renderProbe(clock);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('READY'));
    fireEvent.click(screen.getByText('toggle-due'));
    expect(hitsText()).toBe('');
    clock.set(NOON + 61_000);
    fireEvent.click(screen.getByText('toggle-due')); // off
    fireEvent.click(screen.getByText('toggle-due')); // on again, with a fresh clock
    expect(hitsText()).toBe('水*');
  });
  it('coming back to the window (focus) refreshes the clock without any other interaction', async () => {
    const clock = mutableClock();
    renderProbe(clock);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('READY'));
    fireEvent.click(screen.getByText('toggle-due'));
    expect(hitsText()).toBe('');
    clock.set(NOON + 61_000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(hitsText()).toBe('水*');
  });
  it('the tab becoming visible again refreshes the clock; becoming hidden does not', async () => {
    const clock = mutableClock();
    renderProbe(clock);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('READY'));
    fireEvent.click(screen.getByText('toggle-due'));
    clock.set(NOON + 61_000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(hitsText()).toBe('');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(hitsText()).toBe('水*');
  });
});

describe('search screen (real repositories, real dataset)', () => {
  const app = (over: Partial<AppRepositories> = {}): AppRepositories => ({ kanji: repos.kanji, review: repos.review, newItems: realProjectList, ...over });
  const show = (value: AppRepositories) =>
    render(
      <RepositoriesProvider value={value}>
        <KanjiSearch onExit={() => undefined} />
      </RepositoriesProvider>,
    );
  const input = () => screen.getByLabelText(/ค้นหา · Search/);

  it('shows loading first, then all 196 results', async () => {
    show(app());
    expect(screen.getByRole('status').textContent).toContain('Loading');
    expect(await screen.findByText('พบ 196 ตัว · 196 found')).toBeTruthy();
  });

  it('typing "water" shows 水 once; no result shows the empty state, not an error', async () => {
    show(app());
    await screen.findByText('พบ 196 ตัว · 196 found');
    fireEvent.change(input(), { target: { value: 'water' } });
    expect(screen.getAllByText('水')).toHaveLength(1);
    fireEvent.change(input(), { target: { value: 'qqqzzz' } });
    expect(screen.getByText('ไม่พบคันจิที่ตรงกับการค้นหา')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows readings exactly as stored, with romaji only when it exists, and never "null"', async () => {
    show(app());
    await screen.findByText('พบ 196 ตัว · 196 found');
    fireEvent.change(input(), { target: { value: '十' } });
    const card = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('ジッ')) as HTMLElement;
    expect(card.textContent).toContain('ジッ');
    expect(card.textContent).not.toMatch(/null|undefined|N\/A/);
    fireEvent.change(input(), { target: { value: 'ひとつ' } });
    expect(screen.getByText(/ひと\.つ/)).toBeTruthy(); // matched without the dot, displayed with it
  });

  it('does not invent Thai: a Thai line shows exactly the approved meanings, or nothing', async () => {
    show(app());
    await screen.findByText('พบ 196 ตัว · 196 found');
    fireEvent.change(input(), { target: { value: 'water' } });
    const thaiLines = [...document.querySelectorAll('[lang="th"]')].map((el) => el.textContent ?? '');
    const approved = approvedThai('水');
    if (approved.length === 0) expect(thaiLines).toEqual([]);
    else for (const meaning of approved) expect(thaiLines.join(' ')).toContain(meaning);
  });

  it('state filter + search + Due now combine, with real review data', async () => {
    for (const mode of ['A', 'B', 'C', 'D'] as const) await repos.review.saveCard(storedCard('水', mode, { state: 'MASTERED', reviewCount: 9, due: 1 }));
    await repos.review.saveCard(storedCard('火', 'A', { state: 'REVIEW', reviewCount: 2, due: 1 }));
    show(app());
    await screen.findByText('พบ 196 ตัว · 196 found');
    fireEvent.change(screen.getByLabelText(/สถานะ · State/), { target: { value: 'MASTERED' } });
    expect(screen.getByText('พบ 1 ตัว · 1 found')).toBeTruthy();
    expect(screen.getAllByText('Mastered Kanji').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/สถานะ · State/), { target: { value: 'REVIEW' } });
    fireEvent.click(screen.getByRole('button', { name: /Due now/ }));
    expect(screen.getByText('พบ 1 ตัว · 1 found')).toBeTruthy();
    fireEvent.change(input(), { target: { value: 'water' } });
    expect(screen.getByText('ไม่พบคันจิที่ตรงกับการค้นหา')).toBeTruthy();
  });

  it('a repository failure is an error state with retry, never "not found"', async () => {
    let fail = true;
    const kanji = Object.assign(Object.create(repos.kanji) as Repositories['kanji'], {
      getAllReadings: () => (fail ? Promise.reject(new RepositoryError('IDB boom')) : repos.kanji.getAllReadings()),
    });
    show(app({ kanji }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('โหลดข้อมูลไม่สำเร็จ');
    expect(alert.textContent).not.toContain('IDB boom');
    expect(screen.queryByText('ไม่พบคันจิที่ตรงกับการค้นหา')).toBeNull();
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'ลองอีกครั้ง' }));
    expect(await screen.findByText('พบ 196 ตัว · 196 found')).toBeTruthy();
  });

  it('controls have labels and the toggle exposes its state', async () => {
    show(app());
    await screen.findByText('พบ 196 ตัว · 196 found');
    expect(input().getAttribute('type')).toBe('search');
    const toggle = screen.getByRole('button', { name: /Due now/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('result card text', () => {
  it('shows Thai only when it exists, and badges as text', () => {
    const entry = buildSearchIndex({
      kanji: [{ id: makeKanjiId('水'), character: '水', level: 'N5', strokeCount: 4, frequency: null, meanings: { en: ['water'], th: ['น้ำ'] } }],
      readings: [{ kanjiId: makeKanjiId('水'), type: 'on', kana: 'スイ', romaji: 'sui' }],
      cards: [],
      order: [],
    })[0]!;
    render(<ul><ResultCard hit={{ entry, tier: null, due: true }} /></ul>);
    expect(document.querySelector('[lang="th"]')?.textContent).toBe('น้ำ');
    expect(screen.getByText('スイ')).toBeTruthy(); // katakana shown as stored
    expect(screen.getByText('ใหม่ · New')).toBeTruthy();
    expect(screen.getByText('ถึงกำหนด · Due')).toBeTruthy();
  });
});
