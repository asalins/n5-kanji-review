import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildAppServices } from '../../../src/app/bootstrap';
import { sessionOnlyOrchestrator, type ReviewOrchestrator } from '../../../src/features/review/reviewBoundary';
import { ReviewSession } from '../../../src/features/review/ReviewSession';
import { RepositoriesProvider, type AppRepositories } from '../../../src/hooks/useRepositories';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { StudyPage } from '../../../src/pages/StudyPage';
import type { StudySession } from '../../../src/types/entities';
import { RepositoryError } from '../../../src/utils/errors';
import { openRealRepositories } from '../../helpers/realData';
import { NOON, cardId, logAt, realProjectList, storedCard } from '../../helpers/sessionFixtures';

let repos: Repositories;
let dispose: () => Promise<void>;
let savedSessions: StudySession[];
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
  savedSessions = [];
});
afterEach(async () => {
  cleanup();
  await dispose();
});

const LIMITS = { newCards: 2, reviews: 20 };
const ALL = { from: new Date(0), to: new Date(8.64e15) };

/** Real repositories and the real orchestrator; saveSession calls are recorded because sessions have no read API. */
function services(over: Partial<AppRepositories> = {}): AppRepositories {
  const base = buildAppServices(repos);
  const review = Object.assign(Object.create(repos.review) as Repositories['review'], {
    saveSession: (session: StudySession) => {
      savedSessions.push(session);
      return repos.review.saveSession(session);
    },
  });
  return { ...base, review, newItems: realProjectList, ...over };
}

/** A clock that moves 1 s per read, so measured durations are real and every instant stays on the same local day. */
function ticking() {
  let t = NOON;
  return () => (t += 1_000);
}

function renderReview(value: AppRepositories, extra: { limits?: typeof LIMITS; orchestrator?: ReviewOrchestrator; now?: () => number } = {}) {
  return render(
    <RepositoriesProvider value={value}>
      <ReviewSession onExit={() => undefined} limits={extra.limits ?? LIMITS} now={extra.now ?? ticking()} orchestrator={extra.orchestrator} />
    </RepositoriesProvider>,
  );
}
const start = async () => fireEvent.click(await screen.findByRole('button', { name: /Start/ }));
const reveal = () => fireEvent.click(screen.getByRole('button', { name: /Show answer/ }));
const rate = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name: name }));
const card = (n: number, total: number) => screen.findByText(new RegExp(`Card ${n} of ${total}`));

describe('review session: real flow through the orchestrator', () => {
  it('shows the new cards from the project list, stores card + log for each rating, and ends with a real summary', async () => {
    renderReview(services());
    expect(await screen.findByText('2 ใบในรอบนี้')).toBeTruthy();
    expect(screen.getByText('ทบทวน 0 ใบ · ใหม่ 2 ใบ')).toBeTruthy();
    await start();
    await card(1, 2);
    expect(document.querySelector('[lang="ja"]')?.textContent).toBe('一'); // first project-list kanji, mode A
    reveal();
    rate(/Good/);
    await card(2, 2);
    reveal();
    rate(/Again/);
    expect(await screen.findByText('จบรอบทบทวนแล้ว')).toBeTruthy();

    const first = await repos.review.getCard(cardId('一', 'A'));
    expect(first).toMatchObject({ state: 'LEARNING', reviewCount: 1, correctCount: 1, algorithmVersion: 'srs-v1' });
    const second = await repos.review.getCard(cardId('一', 'B'));
    expect(second).toMatchObject({ reviewCount: 1, incorrectCount: 1 });
    const logs = await repos.review.getLogs(ALL);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ stateBefore: 'NEW', datasetVersion: 'n5-2026.10.01' });
    expect(logs.every((l) => Number.isInteger(l.durationMs) && l.durationMs > 0)).toBe(true);

    // summary shown to the user comes from the real results (1 Good, 1 Again -> 50%)
    expect(screen.getByText('ทบทวนแล้ว 2 จาก 2 ใบ')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    // the StudySession record: saved at start with the selected card ids, saved again at the end with a summary
    expect(savedSessions).toHaveLength(2);
    expect(savedSessions[0]).toMatchObject({ endedAt: null, summary: null, cardIds: [cardId('一', 'A'), cardId('一', 'B')] });
    expect(savedSessions[1]).toMatchObject({ summary: { reviewedCount: 2, correctCount: 1, incorrectCount: 1 } });
    expect(savedSessions[1]?.endedAt).not.toBeNull();
  });

  it('the new-card allowance is consumed only by successful reviews, then the next session says the limit is reached', async () => {
    const value = services();
    renderReview(value);
    await start();
    for (const n of [1, 2]) {
      await card(n, 2);
      reveal();
      rate(/Easy/);
    }
    await screen.findByText('จบรอบทบทวนแล้ว');
    fireEvent.click(screen.getByRole('button', { name: /Next round/ }));
    expect(await screen.findByText('ครบโควตาของวันนี้แล้ว')).toBeTruthy();
  });

  it('due cards come first, then new cards', async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW', interval: 1_440, due: NOON - 60_000, reviewCount: 1 }));
    renderReview(services());
    expect(await screen.findByText('ทบทวน 1 ใบ · ใหม่ 2 ใบ')).toBeTruthy();
    await start();
    expect(await screen.findByText(/Card 1 of 3 · ทบทวน/)).toBeTruthy();
    expect(document.querySelector('[lang="ja"]')?.textContent).toBe('水');
  });

  it('keyboard: Space reveals, 1-4 rate', async () => {
    renderReview(services());
    await start();
    await card(1, 2);
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '3' });
    await card(2, 2);
    expect((await repos.review.getCard(cardId('一', 'A')))?.reviewCount).toBe(1);
  });

  it('abandoning a session creates no log and consumes no allowance', async () => {
    const first = renderReview(services());
    await start();
    await card(1, 2);
    reveal();
    first.unmount(); // user leaves before rating
    expect(await repos.review.getLogs(ALL)).toEqual([]);
    renderReview(services());
    expect(await screen.findByText('2 ใบในรอบนี้')).toBeTruthy(); // the same 2 new cards are still available
  });
});

describe('review save failures do not advance or count', () => {
  it('a rolled-back write keeps the card on screen with an alert; nothing is counted and no raw error is shown', async () => {
    // the first card's log id is already taken (yesterday's log) so the real transaction fails and rolls back
    await repos.review.appendLog(logAt(1, NOON - 2 * 86_400_000, 'REVIEW', { id: `${cardId('一', 'A')}#1`, cardId: cardId('一', 'A') }));
    renderReview(services());
    await start();
    await card(1, 2);
    reveal();
    rate(/Good/);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('บันทึกผลไม่สำเร็จ');
    expect(alert.textContent).not.toMatch(/ConstraintError|IndexedDB|transaction/i);
    expect(screen.getByText(/Card 1 of 2/)).toBeTruthy(); // did not advance
    expect(screen.getByRole('group')).toBeTruthy(); // can rate again
    expect(await repos.review.getCard(cardId('一', 'A'))).toMatchObject({ state: 'NEW', reviewCount: 0 }); // card rolled back
    expect(await repos.review.getLogs({ from: new Date(NOON - 3_600_000), to: new Date(NOON + 86_400_000) })).toEqual([]);
  });

  it('retrying after a failure submits the rating once and only the successful review is counted', async () => {
    const calls: string[] = [];
    let failNext = true;
    const real = buildAppServices(repos).reviewOrchestrator as ReviewOrchestrator;
    const flaky: ReviewOrchestrator = {
      submit: (request) => {
        calls.push(request.rating);
        if (failNext) {
          failNext = false;
          return Promise.reject(new RepositoryError('write failed'));
        }
        return real.submit(request);
      },
    };
    renderReview(services({ reviewOrchestrator: flaky }), { limits: { newCards: 1, reviews: 20 } });
    await start();
    await card(1, 1);
    reveal();
    rate(/Hard/);
    await screen.findByRole('alert');
    rate(/Hard/);
    expect(await screen.findByText('จบรอบทบทวนแล้ว')).toBeTruthy();
    expect(calls).toEqual(['HARD', 'HARD']);
    expect(await repos.review.getLogs(ALL)).toHaveLength(1); // exactly one stored review
    expect(screen.getByText('ทบทวนแล้ว 1 จาก 1 ใบ')).toBeTruthy(); // the failed attempt is not counted
  });
});

describe('states are told apart', () => {
  it('nothing due and nothing new -> a calm empty state, not an error and not "limit reached"', async () => {
    renderReview(services({ newItems: { getOrderedItems: async () => [] } }));
    expect(await screen.findByText('ไม่มีการ์ดให้ทบทวนตอนนี้')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('ครบโควตาของวันนี้แล้ว')).toBeNull();
  });

  it('limits reached while cards exist -> its own message', async () => {
    renderReview(services(), { limits: { newCards: 0, reviews: 0 } });
    expect(await screen.findByText('ครบโควตาของวันนี้แล้ว')).toBeTruthy();
    expect(screen.queryByText('ไม่มีการ์ดให้ทบทวนตอนนี้')).toBeNull();
  });

  const failing = (over: Partial<Repositories['review']>) =>
    Object.assign(Object.create(repos.review) as Repositories['review'], over);

  it('SESSION_LOAD_ERROR: the plan cannot be read -> an error, never "all done"', async () => {
    renderReview(services({ review: failing({ getLogs: () => Promise.reject(new RepositoryError('IDB boom')) }) }));
    expect(await screen.findByText('เตรียมรอบทบทวนไม่สำเร็จ')).toBeTruthy();
    expect(screen.queryByText(/IDB boom/)).toBeNull();
    expect(screen.queryByText('ไม่มีการ์ดให้ทบทวนตอนนี้')).toBeNull();
  });

  it('DATA_LOAD_ERROR: the dataset is not in the content stores (never "nothing to review")', async () => {
    const kanji = Object.assign(Object.create(repos.kanji) as Repositories['kanji'], { getById: () => Promise.resolve(null) });
    renderReview(services({ kanji }));
    expect(await screen.findByText('โหลดข้อมูลคันจิไม่สำเร็จ')).toBeTruthy();
    expect(screen.queryByText('ไม่มีการ์ดให้ทบทวนตอนนี้')).toBeNull();
  });

  it('DATA_LOAD_ERROR: kanji data cannot be read', async () => {
    const kanji = Object.assign(Object.create(repos.kanji) as Repositories['kanji'], {
      getReadings: () => Promise.reject(new RepositoryError('read failed')),
    });
    renderReview(services({ kanji }));
    expect(await screen.findByText('โหลดข้อมูลคันจิไม่สำเร็จ')).toBeTruthy();
  });

  it('SESSION_STATE_ERROR: no orchestrator wired, or the session record cannot be saved', async () => {
    renderReview(services({ reviewOrchestrator: undefined }));
    expect(await screen.findByText('เริ่มรอบทบทวนไม่สำเร็จ')).toBeTruthy();
    cleanup();
    renderReview(services({ review: failing({ saveSession: () => Promise.reject(new RepositoryError('nope')) }) }));
    await start();
    expect(await screen.findByText('เริ่มรอบทบทวนไม่สำเร็จ')).toBeTruthy();
  });

  it('a failing end-of-session record still shows the summary and says so; reviews are stored', async () => {
    let calls = 0;
    const review = failing({
      saveSession: (s: StudySession) => (++calls === 2 ? Promise.reject(new RepositoryError('late failure')) : repos.review.saveSession(s)),
    });
    renderReview(services({ review }), { limits: { newCards: 1, reviews: 20 } });
    await start();
    await card(1, 1);
    reveal();
    rate(/Good/);
    expect(await screen.findByText('จบรอบทบทวนแล้ว')).toBeTruthy();
    expect(screen.getByText(/บันทึกสรุปรอบนี้ไม่สำเร็จ/)).toBeTruthy();
    expect(await repos.review.getLogs(ALL)).toHaveLength(1);
  });
});

describe('practice mode never writes SRS state', () => {
  it('rating in practice stores no card and no log even though the app has a real orchestrator', async () => {
    render(
      <RepositoriesProvider value={services()}>
        <StudyPage onExit={() => undefined} />
      </RepositoriesProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Kanji → Meaning|A/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Show answer/ })).toBeTruthy());
    reveal();
    rate(/Good/);
    await waitFor(() => expect(screen.getByText(/Card 2 of/)).toBeTruthy());
    expect(await repos.review.getLogs(ALL)).toEqual([]);
    expect(await repos.review.getNewCards(1_000)).toEqual([]);
    expect(sessionOnlyOrchestrator).toBeDefined();
  });
});

describe('AGAIN does not put the card back into the same session (fixed queue, approved Phase 6 behaviour)', () => {
  it('two planned cards: AGAIN on the first, GOOD on the second, and the session ends after exactly two', async () => {
    renderReview(services());
    await start();
    await card(1, 2);
    reveal();
    rate(/Again/);
    await card(2, 2);
    reveal();
    rate(/Good/);
    expect(await screen.findByText('จบรอบทบทวนแล้ว')).toBeTruthy();
    expect(screen.getByText(/ทบทวนแล้ว 2 จาก 2 ใบ/)).toBeTruthy();
    expect(screen.queryByText(/of 3/)).toBeNull();
  });
});

