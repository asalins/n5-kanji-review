/**
 * L4-R F10-A: is this device's clock right? Measured against the server's `Date` header, never assumed.
 *
 *  - The server time comes from a HEAD request to the app's own origin (Cloudflare Pages), cache: 'no-store', a unique
 *    query string and method HEAD (the service worker precaches GET only and serves no runtime route): a real network
 *    answer. No `Date` header, an unparsable one, a failed request or a slow one (> CLOCK_CHECK_MAX_RTT_MS) = UNKNOWN,
 *    never "the clock is right".
 *  - `Date` has 1 s resolution and the request takes time: the server time is placed at the middle of the round trip
 *    and the uncertainty = 500 ms + RTT / 2. "Wrong" only when |skew| - uncertainty >= CLOCK_SKEW_LIMIT_MS (certain);
 *    "ok" only when |skew| + uncertainty < the limit; in between = unknown ('uncertain').
 *  - A result is used for at most CLOCK_CHECK_MAX_AGE_MS, measured with the monotonic clock (changing the device
 *    clock does not make an old result look fresh). Within that time a jump of the device clock is subtracted
 *    (wall time moved by more than the monotonic time). After it: unknown ('stale') until measured again.
 *  - Nothing here changes a stored time. It only says whether a NEW review may be recorded now (see bootstrap).
 */
export const CLOCK_SKEW_LIMIT_MS = 5 * 60_000;
export const CLOCK_CHECK_MAX_AGE_MS = 5 * 60_000;
export const CLOCK_CHECK_MAX_RTT_MS = 10_000;
const DATE_RESOLUTION_HALF_MS = 500;

export type ClockUnknownReason = 'offline' | 'no-server-time' | 'failed' | 'slow' | 'uncertain' | 'stale' | 'not-checked';

export type ClockState =
  | { readonly kind: 'ok'; readonly skewMs: number; readonly uncertaintyMs: number }
  | { readonly kind: 'wrong'; readonly skewMs: number; readonly uncertaintyMs: number }
  | { readonly kind: 'unknown'; readonly reason: ClockUnknownReason };

export interface ClockEnvironment {
  /** Device wall clock (Date.now). */
  now(): number;
  /** Monotonic clock (performance.now): not affected by changing the device clock. */
  monotonic(): number;
  isOnline(): boolean;
  /** The server's `Date` header of a real network answer, or null if there was none. Rejects on a network error. */
  fetchServerDate(): Promise<string | null>;
}

interface Measurement {
  readonly skewMs: number;
  readonly uncertaintyMs: number;
  readonly wallAt: number;
  readonly monoAt: number;
}

export interface ClockService {
  /** Measures now (one request). Concurrent calls share one request. */
  check(): Promise<ClockState>;
  /** The last measurement if still fresh (jump-corrected), else unknown. No request. */
  current(): ClockState;
  subscribe(listener: () => void): () => void;
}

/** Server time (ms) = device time + skew. */
export function classify(skewMs: number, uncertaintyMs: number): ClockState {
  const size = Math.abs(skewMs);
  if (size - uncertaintyMs >= CLOCK_SKEW_LIMIT_MS) return { kind: 'wrong', skewMs, uncertaintyMs };
  if (size + uncertaintyMs < CLOCK_SKEW_LIMIT_MS) return { kind: 'ok', skewMs, uncertaintyMs };
  return { kind: 'unknown', reason: 'uncertain' };
}

export function createClockService(env: ClockEnvironment): ClockService {
  let last: Measurement | null = null;
  let lastUnknown: ClockUnknownReason = 'not-checked';
  let inFlight: Promise<ClockState> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const current = (): ClockState => {
    if (last === null) return { kind: 'unknown', reason: lastUnknown };
    const monoAge = env.monotonic() - last.monoAt;
    if (monoAge < 0 || monoAge > CLOCK_CHECK_MAX_AGE_MS) return { kind: 'unknown', reason: 'stale' };
    // The device clock was changed since the measurement: wall time moved by `jump` more than real time.
    const jump = env.now() - last.wallAt - monoAge;
    return classify(last.skewMs - jump, last.uncertaintyMs);
  };

  const measure = async (): Promise<ClockState> => {
    if (!env.isOnline()) {
      last = null;
      lastUnknown = 'offline';
      return { kind: 'unknown', reason: 'offline' };
    }
    const wall0 = env.now();
    const mono0 = env.monotonic();
    let header: string | null;
    try {
      header = await env.fetchServerDate();
    } catch {
      last = null;
      lastUnknown = env.isOnline() ? 'failed' : 'offline';
      return { kind: 'unknown', reason: lastUnknown };
    }
    const mono1 = env.monotonic();
    const rtt = mono1 - mono0;
    const server = header === null ? Number.NaN : Date.parse(header);
    if (!Number.isFinite(server)) {
      last = null;
      lastUnknown = 'no-server-time';
      return { kind: 'unknown', reason: 'no-server-time' };
    }
    if (rtt < 0 || rtt > CLOCK_CHECK_MAX_RTT_MS) {
      last = null;
      lastUnknown = 'slow';
      return { kind: 'unknown', reason: 'slow' };
    }
    // The header truncates to the second: the true server time at the answer was in [server, server + 1000).
    const deviceAtMiddle = wall0 + rtt / 2;
    const skewMs = Math.round(server + DATE_RESOLUTION_HALF_MS - deviceAtMiddle);
    const uncertaintyMs = Math.round(DATE_RESOLUTION_HALF_MS + rtt / 2);
    last = { skewMs, uncertaintyMs, wallAt: deviceAtMiddle, monoAt: mono0 + rtt / 2 };
    return current();
  };

  return {
    check() {
      if (inFlight === null) {
        inFlight = measure().finally(() => {
          inFlight = null;
          notify();
        });
      }
      return inFlight;
    },
    current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The browser environment: HEAD to the app's own origin, never from a cache. */
export const browserClockEnvironment = (): ClockEnvironment => ({
  now: () => Date.now(),
  monotonic: () => performance.now(),
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  async fetchServerDate() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLOCK_CHECK_MAX_RTT_MS);
    try {
      const url = `/favicon.svg?clock-check=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const response = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'omit', signal: controller.signal });
      // Same-origin network answers are 'basic'; anything else (opaque, an error page from elsewhere) is not trusted.
      if (response.type !== 'basic') return null;
      return response.headers.get('date');
    } finally {
      clearTimeout(timer);
    }
  },
});

export class ClockSkewError extends Error {
  constructor(readonly skewMs: number) {
    super(`Device clock is off by ${Math.round(skewMs / 1000)} s: the review is not recorded`);
    this.name = 'ClockSkewError';
  }
}

/** Human size of a clock difference, e.g. "เร็วไป 1 วัน · ahead by 1 day" (server = device + skew). */
export function describeSkew(skewMs: number): string {
  const ahead = skewMs < 0;
  const abs = Math.abs(skewMs);
  const [n, th, en] =
    abs >= 84_600_000 ? [Math.round(abs / 86_400_000), 'วัน', 'day'] : abs >= 3_570_000 ? [Math.round(abs / 3_600_000), 'ชั่วโมง', 'hour'] : [Math.round(abs / 60_000), 'นาที', 'min'];
  const plural = n === 1 || en === 'min' ? en : `${en}s`;
  return ahead ? `เร็วไป ${n} ${th} · ahead by ${n} ${plural}` : `ช้าไป ${n} ${th} · behind by ${n} ${plural}`;
}
