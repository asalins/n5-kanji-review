import { afterEach, describe, expect, it } from 'vitest';
import { localDay } from '../../../src/utils/localDay';
import { ValidationError } from '../../../src/utils/errors';

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const ZONES = ['Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC'] as const;

describe.each(ZONES)('local calendar day in %s (never UTC, never a fixed zone)', (zone) => {
  const use = () => {
    process.env.TZ = zone;
  };

  it('uses the runtime time zone', () => {
    use();
    const expected: Record<string, number> = { 'Asia/Bangkok': -420, 'UTC': 0 };
    if (zone in expected) expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(expected[zone]);
    expect(localDay(new Date(2026, 9, 2, 12).getTime()).key).toBe('2026-10-02');
  });

  it('23:59 and 23:59:59.999 are still today; 00:00 and 00:00:00.000 start the next day', () => {
    use();
    expect(localDay(new Date(2026, 9, 2, 23, 59).getTime()).key).toBe('2026-10-02');
    expect(localDay(new Date(2026, 9, 2, 23, 59, 59, 999).getTime()).key).toBe('2026-10-02');
    expect(localDay(new Date(2026, 9, 3, 0, 0).getTime()).key).toBe('2026-10-03');
    expect(localDay(new Date(2026, 9, 3, 0, 0, 0, 0).getTime()).key).toBe('2026-10-03');
  });

  it('the range is [local midnight, next local midnight) and contains the instant', () => {
    use();
    const now = new Date(2026, 9, 2, 23, 59, 59, 999).getTime();
    const day = localDay(now);
    expect(day.from.getTime()).toBe(new Date(2026, 9, 2, 0, 0, 0, 0).getTime());
    expect(day.to.getTime()).toBe(new Date(2026, 9, 3, 0, 0, 0, 0).getTime());
    expect(day.from.getTime() <= now && now < day.to.getTime()).toBe(true);
    // the first millisecond of the next day is outside this day and inside the next
    expect(day.to.getTime() <= day.to.getTime()).toBe(true);
    expect(localDay(day.to.getTime()).key).toBe('2026-10-03');
  });
});

describe('daylight-saving days', () => {
  it('a 25-hour fall-back day and a 23-hour spring-forward day are each one calendar day', () => {
    process.env.TZ = 'America/Los_Angeles';
    const fallBack = localDay(new Date(2026, 10, 1, 12).getTime()); // 2026-11-01
    expect((fallBack.to.getTime() - fallBack.from.getTime()) / 3_600_000).toBe(25);
    const springForward = localDay(new Date(2026, 2, 8, 12).getTime()); // 2026-03-08
    expect((springForward.to.getTime() - springForward.from.getTime()) / 3_600_000).toBe(23);
  });
});

describe('validation', () => {
  it('rejects a non-finite instant', () => {
    expect(() => localDay(Number.NaN)).toThrow(ValidationError);
  });
});
