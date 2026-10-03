import { useState, type ReactNode } from 'react';
import { StateMessage } from '../../components/StateMessage';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/styles';
import { LEARNING_STATES } from '../../types/entities';
import type { PeriodStats } from '../../services/statistics/history';
import type { Statistics } from '../../services/statistics/statisticsService';
import { HistoryChart } from './HistoryChart';
import { STATE_LABEL, TEXT, formatAccuracyRatio, formatPercent } from './strings';
import { useStatistics, type StatisticsState } from './useStatistics';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 text-left">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
      <dt className="text-sm text-stone-600 dark:text-neutral-400">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {note !== undefined && <dd className="text-xs text-stone-500 dark:text-neutral-400">{note}</dd>}
    </div>
  );
}

function Bar({ label, value, percent }: { label: string; value: string; percent: number | null }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent ?? 0)}
        aria-valuetext={`${value} (${formatPercent(percent)})`}
        className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-neutral-700"
      >
        <div className="h-full bg-red-700 dark:bg-red-400" style={{ width: `${percent ?? 0}%` }} />
      </div>
    </div>
  );
}

function PeriodRow({ label, stats }: { label: string; stats: PeriodStats }) {
  return (
    <tr className="border-t border-stone-200 dark:border-neutral-700">
      <th scope="row" className="py-1 pr-2 text-left font-medium">
        {label}
      </th>
      <td className="px-1 text-right tabular-nums">{stats.reviewCount}</td>
      <td className="px-1 text-right tabular-nums">{stats.correctCount}</td>
      <td className="px-1 text-right tabular-nums">{stats.incorrectCount}</td>
      <td className="pl-1 text-right tabular-nums">{formatAccuracyRatio(stats.accuracy)}</td>
    </tr>
  );
}

function History({ statistics }: { statistics: Statistics }) {
  const [range, setRange] = useState<'last7' | 'last30'>('last7');
  const days = statistics.history[range];
  const label = range === 'last7' ? TEXT.last7 : TEXT.last30;
  return (
    <Section id="stats-history" title={TEXT.history}>
      {!statistics.hasReviews ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-stone-600 dark:border-neutral-600 dark:text-neutral-400">
          {TEXT.noHistory}
        </p>
      ) : (
        <>
          <div role="group" aria-label={TEXT.history} className="flex gap-2">
            {(['last7', 'last30'] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setRange(key)}
                className={`${SECONDARY_BUTTON} min-h-11 flex-1 ${range === key ? 'border-red-700 font-semibold dark:border-red-400' : ''}`}
              >
                {key === 'last7' ? TEXT.last7 : TEXT.last30}
              </button>
            ))}
          </div>
          <HistoryChart days={days} label={label} />
          <table className="w-full text-sm">
            <thead className="text-stone-600 dark:text-neutral-400">
              <tr>
                <th scope="col" className="text-left font-medium" />
                <th scope="col" className="px-1 text-right font-medium">{TEXT.reviews}</th>
                <th scope="col" className="px-1 text-right font-medium">{TEXT.correct}</th>
                <th scope="col" className="px-1 text-right font-medium">{TEXT.incorrect}</th>
                <th scope="col" className="pl-1 text-right font-medium">{TEXT.accuracy}</th>
              </tr>
            </thead>
            <tbody>
              <PeriodRow label={TEXT.today} stats={statistics.periods.today} />
              <PeriodRow label={TEXT.last7} stats={statistics.periods.last7} />
              <PeriodRow label={TEXT.last30} stats={statistics.periods.last30} />
              <PeriodRow label={TEXT.allTime} stats={statistics.periods.allTime} />
            </tbody>
          </table>
        </>
      )}
    </Section>
  );
}

export function DashboardView({ statistics }: { statistics: Statistics }) {
  const { today, queue, kanji, streak, cardsByState } = statistics;
  return (
    <div className="flex w-full flex-col gap-6">
      <Section id="stats-today" title={TEXT.today}>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label={TEXT.reviewsToday} value={String(today.reviewsToday)} />
          <Stat label={TEXT.correct} value={String(today.correct)} />
          <Stat label={TEXT.incorrect} value={String(today.incorrect)} />
          <Stat label={TEXT.accuracy} value={formatAccuracyRatio(today.accuracy)} />
          <Stat label={TEXT.reviewQuota} value={`${today.reviewQuotaUsed} / ${today.reviewQuotaLimit}`} />
          <Stat label={TEXT.newCards} value={`${today.newCardsStudied} / ${today.newCardLimit}`} />
        </dl>
      </Section>

      <Section id="stats-queue" title={TEXT.queue}>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label={TEXT.due} value={String(queue.due)} />
          <Stat label={TEXT.newAvailable} value={String(queue.newAvailable)} />
        </dl>
      </Section>

      <Section id="stats-kanji" title={TEXT.kanjiProgress}>
        <Bar label={TEXT.learned} value={`${kanji.learned} / ${kanji.total}`} percent={kanji.learnedPercent} />
        <Bar label={TEXT.mastered} value={`${kanji.mastered} / ${kanji.total}`} percent={kanji.masteredPercent} />
        <p className="text-sm text-stone-600 dark:text-neutral-400">
          {TEXT.remaining}: <span className="font-semibold tabular-nums">{kanji.remaining}</span>
        </p>
        <h3 className="mt-2 text-sm font-semibold">{TEXT.reviewCardsByState}</h3>
        <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {LEARNING_STATES.map((state) => (
            <li key={state} className="flex justify-between rounded-lg bg-stone-100 px-3 py-1.5 dark:bg-neutral-800">
              <span>{STATE_LABEL[state]}</span>
              <span className="font-semibold tabular-nums">{cardsByState[state]}</span>
            </li>
          ))}
          <li className="flex justify-between px-3 py-1.5 text-stone-600 dark:text-neutral-400">
            <span>{TEXT.reviewCards}</span>
            <span className="font-semibold tabular-nums">{statistics.reviewCards}</span>
          </li>
        </ul>
      </Section>

      <Section id="stats-streak" title={TEXT.streak}>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label={TEXT.currentStreak} value={`${streak.current} ${TEXT.days}`} />
          <Stat label={TEXT.longestStreak} value={`${streak.longest} ${TEXT.days}`} />
        </dl>
        <p className="text-sm">{streak.studiedToday ? `✓ ${TEXT.studiedToday}` : `○ ${TEXT.notStudiedToday}`}</p>
      </Section>

      <History statistics={statistics} />
    </div>
  );
}

export function Dashboard({ state, onRetry }: { state: StatisticsState; onRetry: () => void }) {
  if (state.status === 'LOADING') return <StateMessage tone="loading" title={TEXT.loading} />;
  if (state.status === 'ERROR') {
    return (
      <StateMessage tone="error" title={TEXT.errorTitle} description={TEXT.errorDescription}>
        <button type="button" onClick={onRetry} className={PRIMARY_BUTTON}>
          {TEXT.retry}
        </button>
      </StateMessage>
    );
  }
  return <DashboardView statistics={state.statistics} />;
}

/** Loads real statistics through the repositories and renders them. */
export function ProgressDashboard() {
  const { state, reload } = useStatistics();
  return <Dashboard state={state} onRetry={() => void reload()} />;
}
