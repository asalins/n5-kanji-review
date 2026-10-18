import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAppServices } from '../../../src/app/bootstrap';
import type { Repositories } from '../../../src/repositories/indexeddb';
import {
  CLOCK_CHECK_MAX_AGE_MS,
  CLOCK_CHECK_MAX_RTT_MS,
  CLOCK_SKEW_LIMIT_MS,
  ClockSkewError,
  classify,
  createClockService,
  describeSkew,
  type ClockEnvironment,
} from '../../../src/services/clock/clockCheck';
import { findFutureLogs } from '../../../src/services/clock/futureLogs';
import { openRealRepositories } from '../../helpers/realData';

const SERVER = Date.UTC(2026, 9, 18, 3, 0, 0); // the true time
const DAY = 86_400_000;

/** A device whose clock is `offset` ms off; the server answers with its true (1 s resolution) Date after `rtt` ms. */
function fakeEnv(opts: { offset?: number; rtt?: number; online?: boolean; date?: (serverMs: number) => string | null; fail?: boolean } = {}) {
  let real = SERVER;
  let mono = 1_000;
  let offset = opts.offset ?? 0;
  const env: ClockEnvironment & { advance(ms: number): void; setOffset(ms: number): void; online: boolean; requests: number } = {
    online: opts.online ?? true,
    requests: 0,
    now: () => real + offset,
    monotonic: () => mono,
    isOnline: () => env.online,
    async fetchServerDate() {
      env.requests += 1;
      if (opts.fail === true) throw new TypeError('Failed to fetch');
      env.advance((opts.rtt ?? 40) / 2);
      const header = opts.date ? opts.date(real) : new Date(Math.floor(real / 1000) * 1000).toUTCString();
      env.advance((opts.rtt ?? 40) / 2);
      return header;
    },
    advance(ms) {
      real += ms;
      mono += ms;
    },
    setOffset(ms) {
      offset = ms;
    },
  };
  return env;
}

describe('F10-A clock check (server Date, RTT, freshness)', () => {
  it('a right clock is ok; skew and uncertainty account for the 1 s header and the round trip', async () => {
    const clock = createClockService(fakeEnv({ rtt: 200 }));
    const state = await clock.check();
    expect(state.kind).toBe('ok');
    if (state.kind !== 'ok') return;
    expect(Math.abs(state.skewMs)).toBeLessThanOrEqual(state.uncertaintyMs);
    expect(state.uncertaintyMs).toBe(500 + 100);
  });

  for (const offset of [DAY, -DAY, 10 * 60_000, -10 * 60_000]) {
    it(`a clock ${offset / 60_000} min off is "wrong" with the right sign`, async () => {
      const state = await createClockService(fakeEnv({ offset })).check();
      expect(state.kind).toBe('wrong');
      if (state.kind === 'wrong') expect(Math.sign(state.skewMs)).toBe(-Math.sign(offset));
    });
  }

  it('the 5 min limit: certainly over = wrong, certainly under = ok, within the uncertainty = unknown (never "ok")', () => {
    expect(classify(CLOCK_SKEW_LIMIT_MS + 1_000, 600).kind).toBe('wrong');
    expect(classify(CLOCK_SKEW_LIMIT_MS - 1_000, 600).kind).toBe('ok');
    expect(classify(CLOCK_SKEW_LIMIT_MS + 100, 600)).toEqual({ kind: 'unknown', reason: 'uncertain' });
    expect(classify(-(CLOCK_SKEW_LIMIT_MS - 100), 600)).toEqual({ kind: 'unknown', reason: 'uncertain' });
  });

  it('no Date header, an unparsable one, a failed request, a slow answer or offline = unknown, never ok', async () => {
    expect(await createClockService(fakeEnv({ date: () => null })).check()).toEqual({ kind: 'unknown', reason: 'no-server-time' });
    expect(await createClockService(fakeEnv({ date: () => 'yesterday-ish' })).check()).toEqual({ kind: 'unknown', reason: 'no-server-time' });
    expect(await createClockService(fakeEnv({ fail: true })).check()).toEqual({ kind: 'unknown', reason: 'failed' });
    expect(await createClockService(fakeEnv({ rtt: CLOCK_CHECK_MAX_RTT_MS + 1 })).check()).toEqual({ kind: 'unknown', reason: 'slow' });
    const offline = fakeEnv({ online: false });
    expect(await createClockService(offline).check()).toEqual({ kind: 'unknown', reason: 'offline' });
    expect(offline.requests).toBe(0);
  });

  it('a result is used for at most 5 min of REAL time (monotonic); changing the device clock cannot keep it fresh', async () => {
    const env = fakeEnv({ offset: DAY });
    const clock = createClockService(env);
    expect((await clock.check()).kind).toBe('wrong');
    env.advance(CLOCK_CHECK_MAX_AGE_MS - 1_000);
    expect(clock.current().kind).toBe('wrong');
    env.advance(2_000);
    expect(clock.current()).toEqual({ kind: 'unknown', reason: 'stale' });
  });

  it('a device-clock change after the check is taken into account (no silent "ok" from an old measurement)', async () => {
    const env = fakeEnv();
    const clock = createClockService(env);
    expect((await clock.check()).kind).toBe('ok');
    env.setOffset(DAY); // the user moves the clock one day ahead
    expect(clock.current().kind).toBe('wrong');
    env.setOffset(0); // and back
    expect(clock.current().kind).toBe('ok');
  });

  it('concurrent checks share one request; subscribers are told when it ends', async () => {
    const env = fakeEnv();
    const clock = createClockService(env);
    let told = 0;
    clock.subscribe(() => (told += 1));
    await Promise.all([clock.check(), clock.check(), clock.check()]);
    expect(env.requests).toBe(1);
    expect(told).toBe(1);
  });

  it('describes the difference for the user', () => {
    expect(describeSkew(-DAY)).toBe('เร็วไป 1 วัน · ahead by 1 day');
    expect(describeSkew(2 * 3_600_000)).toBe('ช้าไป 2 ชั่วโมง · behind by 2 hours');
    expect(describeSkew(-10 * 60_000)).toBe('เร็วไป 10 นาที · ahead by 10 min');
    expect(describeSkew(-(86_400_000 - 2_000))).toBe('เร็วไป 1 วัน · ahead by 1 day'); // measured a little under a day
  });
});

describe('F10-A in the app wiring: only a NEW recorded review is refused, and only when the clock is known to be wrong', () => {
  let repos: Repositories;
  let dispose: () => Promise<void>;
  beforeEach(async () => {
    ({ repos, dispose } = await openRealRepositories());
  });
  afterEach(async () => dispose());
  const request = (at: number) => ({ item: { itemType: 'kanji' as const, itemId: 'kanji:U+6C34' }, mode: 'A' as const, rating: 'GOOD' as const, answeredAt: at, durationMs: 900 });
  const logs = () => repos.review.getLogs({ from: new Date(0), to: new Date(SERVER + 400 * DAY) });

  it('clock one day ahead, online: refused (ClockSkewError), nothing stored; after the clock is fixed and re-checked: stored', async () => {
    const env = fakeEnv({ offset: DAY });
    const clock = createClockService(env);
    const services = buildAppServices(repos, { clock });
    await expect(services.reviewOrchestrator!.submit(request(env.now()))).rejects.toBeInstanceOf(ClockSkewError);
    expect(await logs()).toHaveLength(0);
    env.setOffset(0);
    await clock.check();
    await services.reviewOrchestrator!.submit(request(env.now()));
    expect(await logs()).toHaveLength(1);
  });

  it('offline (time unknown): stored as before, with the device time unchanged (offline-first; no timestamp rewritten)', async () => {
    const env = fakeEnv({ offset: DAY, online: false });
    const services = buildAppServices(repos, { clock: createClockService(env) });
    await services.reviewOrchestrator!.submit(request(env.now()));
    const [log] = await logs();
    expect(log!.reviewedAt).toBe(SERVER + DAY);
  });

  it('a stale measurement is re-checked before deciding (never decided from an old result)', async () => {
    const env = fakeEnv();
    const clock = createClockService(env);
    const services = buildAppServices(repos, { clock });
    await clock.check();
    env.advance(CLOCK_CHECK_MAX_AGE_MS + 1);
    env.setOffset(-DAY); // a day behind now; the old (ok) result is stale
    await expect(services.reviewOrchestrator!.submit(request(env.now()))).rejects.toBeInstanceOf(ClockSkewError);
    expect(env.requests).toBe(2);
  });

  it('future-dated logs are found with a fresh server time (count + dates), never with an unknown one; nothing is changed', async () => {
    const offline = fakeEnv({ offset: DAY, online: false });
    const services = buildAppServices(repos, { clock: createClockService(offline) });
    await services.reviewOrchestrator!.submit(request(offline.now()));
    await services.reviewOrchestrator!.submit({ ...request(offline.now() + 60_000), item: { itemType: 'kanji', itemId: 'kanji:U+706B' } });
    const before = await logs();

    expect(await findFutureLogs(repos.review, { kind: 'unknown', reason: 'offline' }, SERVER)).toBeNull();
    const fresh = await createClockService(fakeEnv()).check(); // the true time, measured
    const found = await findFutureLogs(repos.review, fresh, SERVER);
    const d = new Date(SERVER + DAY);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(found).toEqual({ count: 2, dates: [day] });
    expect(await logs()).toEqual(before);
    // documented limit: once real time passes those dates, they are no longer "future"
    expect(await findFutureLogs(repos.review, fresh, SERVER + 2 * DAY)).toEqual({ count: 0, dates: [] });
  });

  it('practice mode never reaches the guard (it stores nothing): the guard is on the recording orchestrator only', () => {
    const services = buildAppServices(repos);
    expect(services.reviewOrchestrator).toBeDefined(); // no clock passed: no guard at all (tests / no clock)
  });
});
