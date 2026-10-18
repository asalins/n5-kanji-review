import { useEffect, useState } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import { describeSkew, type ClockState } from '../../services/clock/clockCheck';
import { findFutureLogs, type FutureLogs } from '../../services/clock/futureLogs';
import { logError } from '../../utils/userMessage';

const NONE: ClockState = { kind: 'unknown', reason: 'not-checked' };
const REEVALUATE_MS = 15_000;
const same = (a: ClockState, b: ClockState) => JSON.stringify(a) === JSON.stringify(b);

/**
 * F10-A: the device-clock state. Measures when first shown; re-renders when a check finishes and re-evaluates
 * every 15 s (a result goes stale, or the device clock was changed meanwhile).
 */
export function useClockState(): { readonly state: ClockState; readonly recheck: () => void; readonly available: boolean } {
  const { clock } = useRepositories();
  const [state, setState] = useState<ClockState>(() => clock?.current() ?? NONE);
  useEffect(() => {
    if (clock === undefined) return undefined;
    const refresh = () => setState((prev) => (same(prev, clock.current()) ? prev : clock.current()));
    const unsubscribe = clock.subscribe(refresh);
    const timer = setInterval(refresh, REEVALUATE_MS);
    void clock.check();
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [clock]);
  return { state, recheck: () => void clock?.check(), available: clock !== undefined };
}

export const CLOCK_TEXT = {
  wrongTitle: 'เวลาของอุปกรณ์ไม่ตรงกับเวลาจริง · This device’s clock is wrong',
  wrongBody:
    'การทบทวนที่บันทึกผลถูกปิดไว้ เพราะวันที่ของการทบทวนจะผิด (กระทบกำหนดทบทวน สถิติ และการเรียนต่อเนื่อง) เปิด “ตั้งเวลาอัตโนมัติ” ในการตั้งค่าของอุปกรณ์ แล้วกดตรวจอีกครั้ง โหมดฝึก (ไม่บันทึกผล) ยังใช้ได้ · Reviews are not recorded while the clock is wrong (their dates would be wrong). Turn on automatic time in the device settings, then check again. Practice (not recorded) still works.',
  recheck: 'ตรวจเวลาอีกครั้ง · Check again',
  unverified: 'ตรวจเวลากับเซิร์ฟเวอร์ไม่ได้ตอนนี้ การทบทวนจะบันทึกตามเวลาของอุปกรณ์ · The time could not be checked with the server now; reviews are recorded with this device’s clock.',
  unverifiedOffline: 'ออฟไลน์: ตรวจเวลากับเซิร์ฟเวอร์ไม่ได้ การทบทวนจะบันทึกตามเวลาของอุปกรณ์ · Offline: the time cannot be checked; reviews are recorded with this device’s clock.',
  futureTitle: (n: number) => `มี ${n} การทบทวนที่บันทึกด้วยวันที่ในอนาคต · ${n} review(s) recorded with a future date`,
  futureBody:
    'เกิดจากนาฬิกาของอุปกรณ์ที่เร็วไปตอนทบทวน ข้อมูลยังเก็บและ sync ตามปกติ และวันที่ไม่ถูกแก้ สถิติและการเรียนต่อเนื่องจะนับตามวันที่ที่บันทึกไว้ · Caused by a device clock that was ahead. The reviews are kept and synced; their dates are not changed, and statistics count them on those dates.',
  futureDates: 'วันที่ที่บันทึก · Recorded dates:',
};

/** Shown on the review screen: blocking text when wrong, a plain note when the time cannot be verified. */
export function ClockStatusNote({ state, recheck }: { state: ClockState; recheck: () => void }) {
  if (state.kind === 'wrong') {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-lg bg-red-50 px-3 py-3 text-left text-red-900 dark:bg-red-950 dark:text-red-100">
        <p className="font-semibold">{CLOCK_TEXT.wrongTitle}</p>
        <p className="text-sm">({describeSkew(state.skewMs)})</p>
        <p className="text-sm">{CLOCK_TEXT.wrongBody}</p>
        <button type="button" onClick={recheck} className="min-h-11 self-start rounded-lg border border-current px-3 font-semibold">
          {CLOCK_TEXT.recheck}
        </button>
      </div>
    );
  }
  if (state.kind === 'unknown' && state.reason !== 'not-checked') {
    return (
      <p role="status" className="rounded-lg bg-stone-100 px-3 py-2 text-left text-sm text-stone-700 dark:bg-neutral-800 dark:text-neutral-300">
        {state.reason === 'offline' ? CLOCK_TEXT.unverifiedOffline : CLOCK_TEXT.unverified}
      </p>
    );
  }
  return null;
}

/** Home: reviews stored with a future date (count + dates). Shown only with a fresh server time. */
export function FutureLogNotice() {
  const { review, sync } = useRepositories();
  const { state } = useClockState();
  const [found, setFound] = useState<FutureLogs | null>(null);
  const known = state.kind === 'unknown' ? null : `${state.kind}:${Math.round(state.skewMs / 60_000)}`;
  useEffect(() => {
    if (known === null) return;
    let cancelled = false;
    findFutureLogs(review, state, Date.now())
      .then((result) => {
        if (cancelled) return;
        setFound(result);
        if (result !== null && result.count > 0) sync?.log.add(`${result.count} review(s) stored with a future date (device clock): ${result.dates.join(', ')}; kept unchanged`, { once: true });
      })
      .catch(logError);
    return () => {
      cancelled = true;
    };
    // `known` captures the part of the state that matters: re-run only when it changes.
  }, [known, review, sync]);
  if (found === null || found.count === 0) return null;
  return (
    <div role="status" className="flex w-full flex-col gap-1 rounded-lg bg-amber-50 px-3 py-3 text-left text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="future-logs">
      <p className="font-semibold">{CLOCK_TEXT.futureTitle(found.count)}</p>
      <p className="text-sm">{CLOCK_TEXT.futureBody}</p>
      <p className="text-sm">
        {CLOCK_TEXT.futureDates} {found.dates.join(', ')}
      </p>
    </div>
  );
}
