import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RepositoriesProvider, type AppRepositories } from '../../../src/hooks/useRepositories';
import { sessionOnlyOrchestrator, type ReviewRequest } from '../../../src/features/review/reviewBoundary';
import { selectSessionKanji } from '../../../src/features/review/sessionQueue';
import { StudySession } from '../../../src/features/review/StudySession';
import { RepositoryError } from '../../../src/utils/errors';
import type { StudyMode } from '../../../src/types/entities';
import { openRealRepositories } from '../../helpers/realData';

let real: AppRepositories;
let all: Awaited<ReturnType<AppRepositories['kanji']['getByLevel']>>;
let dispose: () => Promise<void>;
beforeAll(async () => {
  const opened = await openRealRepositories();
  dispose = opened.dispose;
  real = { kanji: opened.repos.kanji, review: opened.repos.review };
  all = await real.kanji.getByLevel('N5');
});
afterAll(() => dispose());

const SEED = () => 42;
function renderSession(repos: AppRepositories, mode: StudyMode, extra: { size?: number; orchestrator?: typeof sessionOnlyOrchestrator } = {}) {
  return render(
    <RepositoriesProvider value={repos}>
      <StudySession mode={mode} onExit={() => undefined} createSeed={SEED} size={extra.size ?? 3} orchestrator={extra.orchestrator} />
    </RepositoriesProvider>,
  );
}
const reveal = () => fireEvent.click(screen.getByRole('button', { name: /Show answer/ }));

describe('session queue', () => {
  it('is deterministic for a seed, independent of input order, and never repeats a kanji', () => {
    const a = selectSessionKanji(all, 20, 7).map((k) => k.id);
    const b = selectSessionKanji([...all].reverse(), 20, 7).map((k) => k.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(20);
    expect(selectSessionKanji(all, 20, 8).map((k) => k.id)).not.toEqual(a);
    expect(selectSessionKanji(all, 1000, 1)).toHaveLength(196);
    expect(selectSessionKanji(all, 0, 1)).toEqual([]);
  });
});

describe('study session with the real dataset', () => {
  it.each(['A', 'B', 'C', 'D'] as const)('Mode %s: loads a card, reveals it, and moves on', async (mode) => {
    renderSession(real, mode);
    expect(await screen.findByText('Card 1 of 3')).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull(); // no rating buttons before the reveal
    reveal();
    expect(screen.getByRole('group', { name: /remember/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Good/ }));
    expect(await screen.findByText('Card 2 of 3')).toBeTruthy();
  });

  it('shows a different kanji on every card and finishes with a summary', async () => {
    renderSession(real, 'A');
    const seen: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await screen.findByText(`Card ${i + 1} of 3`);
      seen.push(document.querySelector('[lang="ja"]')?.textContent ?? '');
      reveal();
      fireEvent.click(screen.getByRole('button', { name: /Easy/ }));
    }
    expect(new Set(seen).size).toBe(3);
    expect(await screen.findByText('จบรอบนี้แล้ว')).toBeTruthy();
    expect(screen.getByText(/ยังไม่บันทึกผลการประเมิน/)).toBeTruthy();
  });

  it('keyboard: Space reveals, then 1-4 rate; Enter also reveals', async () => {
    renderSession(real, 'A', { size: 2 });
    await screen.findByText('Card 1 of 2');
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.getByRole('group')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: '3' });
    await screen.findByText('Card 2 of 2');
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(screen.getByRole('group')).toBeTruthy();
  });

  it('keyboard shortcuts do not hijack a focused button', async () => {
    renderSession(real, 'A', { size: 2 });
    await screen.findByText('Card 1 of 2');
    fireEvent.keyDown(screen.getByRole('button', { name: /Show answer/ }), { key: ' ' });
    expect(screen.queryByRole('group')).toBeNull(); // the native button handles its own activation
  });

  it('clicking the card also reveals it', async () => {
    renderSession(real, 'C', { size: 1 });
    await screen.findByText('Card 1 of 1');
    fireEvent.click(document.querySelector('[lang="ja"]') as HTMLElement);
    expect(screen.getByRole('group')).toBeTruthy();
  });

  it('hands only the user intent to the review boundary (no scheduling values)', async () => {
    const requests: ReviewRequest[] = [];
    renderSession(real, 'B', { size: 1, orchestrator: { submit: (r) => { requests.push(r); return Promise.resolve(); } } });
    await screen.findByText('Card 1 of 1');
    reveal();
    fireEvent.click(screen.getByRole('button', { name: /Hard/ }));
    await screen.findByText('จบรอบนี้แล้ว');
    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0]!).sort()).toEqual(['answeredAt', 'item', 'mode', 'rating']);
    expect(requests[0]).toMatchObject({ item: { itemType: 'kanji' }, mode: 'B', rating: 'HARD' });
  });

  it('shows an error state (not the card) when the review boundary fails', async () => {
    renderSession(real, 'A', { size: 1, orchestrator: { submit: () => Promise.reject(new RepositoryError('db exploded')) } });
    await screen.findByText('Card 1 of 1');
    reveal();
    fireEvent.click(screen.getByRole('button', { name: /Good/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toContain('db exploded');
  });
});

/** Repositories are class instances, so derive from them instead of spreading (spread drops prototype methods). */
function withKanji(overrides: Partial<AppRepositories['kanji']>): AppRepositories {
  return { ...real, kanji: Object.assign(Object.create(real.kanji) as AppRepositories['kanji'], overrides) };
}

describe('empty and error states', () => {
  it('shows an empty state when there are no kanji', async () => {
    renderSession(withKanji({ getByLevel: () => Promise.resolve([]) }), 'A');
    expect(await screen.findByText('ยังไม่มีคันจิ')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows "no cards for this mode" when kanji exist but none has readings (Mode C)', async () => {
    renderSession(withKanji({ getReadings: () => Promise.resolve([]) }), 'C');
    expect(await screen.findByText('ไม่มีการ์ดสำหรับโหมดนี้')).toBeTruthy();
  });

  it('shows a friendly error, without raw exception text, when the repository fails', async () => {
    renderSession(withKanji({ getByLevel: () => Promise.reject(new RepositoryError('IDB boom')) }), 'A');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('อ่านข้อมูลไม่สำเร็จ');
    expect(alert.textContent).not.toContain('IDB boom');
    await waitFor(() => expect(screen.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeTruthy());
  });
});
