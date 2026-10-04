import type { DayStats } from '../../services/statistics/history';
import { TEXT, formatAccuracyRatio, shortDate } from './strings';

/**
 * Bars = reviews per day, from real data only. The bars are decorative (aria-hidden); the same numbers are
 * available to assistive technology as a table, and meaning never depends on colour or hover.
 */
export function HistoryChart({ days, label }: { days: readonly DayStats[]; label: string }) {
  const max = Math.max(1, ...days.map((d) => d.reviewCount));
  const first = days[0];
  const last = days[days.length - 1];
  return (
    <div>
      <div aria-hidden="true" className="flex h-28 items-end gap-0.5 border-b border-stone-300 dark:border-neutral-600">
        {days.map((day) => (
          <div key={day.date} className="flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-red-700 dark:bg-red-400"
              style={{ height: `${(day.reviewCount / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      {first !== undefined && last !== undefined && (
        <p aria-hidden="true" className="mt-1 flex justify-between text-xs text-stone-600 dark:text-neutral-400">
          <span>{shortDate(first.date)}</span>
          <span>max {max}/day</span>
          <span>{shortDate(last.date)}</span>
        </p>
      )}
      {/* sr-only on a wrapper, not on the table: a 1px-wide table still lays out at full width and made the
          page scroll sideways on 320-360px phones (measured in Phase 10). The wrapper clips it. */}
      <div className="sr-only">
      <table>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{TEXT.date}</th>
            <th scope="col">{TEXT.reviews}</th>
            <th scope="col">{TEXT.correct}</th>
            <th scope="col">{TEXT.incorrect}</th>
            <th scope="col">{TEXT.accuracy}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{day.reviewCount}</td>
              <td>{day.correctCount}</td>
              <td>{day.incorrectCount}</td>
              <td>{formatAccuracyRatio(day.accuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
