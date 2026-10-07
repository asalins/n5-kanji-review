import { useId, type ReactNode } from 'react';
import { StateMessage } from '../../components/StateMessage';
import { SECONDARY_BUTTON } from '../../components/styles';
import { groupReadings, selectMeanings, type ReadingView } from '../flashcards/presentation';
import { MODE_INFO } from '../flashcards/strings';
import { STATE_LABEL, TEXT } from './strings';
import { useKanjiDetail, type KanjiDetailData, type ModeStatus } from './useKanjiDetail';

const defaultFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left dark:border-neutral-700 dark:bg-neutral-800/60">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ReadingList({ label, items }: { label: string; items: readonly ReadingView[] }) {
  return (
    <div>
      <dt className="text-sm text-stone-500 dark:text-neutral-400">{label}</dt>
      <dd lang="ja" className="flex flex-wrap gap-x-4 gap-y-1 text-lg">
        {items.length === 0
          ? TEXT.none
          : items.map((r) => (
              <span key={r.kana} className="break-all">
                {r.kana}
                {r.romaji !== null && <span lang="en" className="text-sm text-stone-500 dark:text-neutral-400">{` · ${r.romaji}`}</span>}
              </span>
            ))}
      </dd>
    </div>
  );
}

function modeStatusText(status: ModeStatus, format: (ms: number) => string): string {
  if (status.state === null) return TEXT.notStarted;
  if (status.due) return TEXT.dueNow;
  if (status.nextReview === null) return STATE_LABEL[status.state];
  return `${TEXT.next}: ${format(status.nextReview)}`;
}

export function KanjiDetailView({ detail, format = (ms) => defaultFormat.format(ms) }: { detail: KanjiDetailData; format?: (ms: number) => string }) {
  const { kanji } = detail;
  const meanings = selectMeanings(kanji);
  const groups = groupReadings(detail.readings);
  const kanjiStatus = detail.mastered ? TEXT.kanjiMastered : detail.learned ? TEXT.kanjiLearned : TEXT.kanjiNew;
  return (
    <div className="flex flex-col gap-4">
      <p lang="ja" className="text-center text-8xl leading-none" aria-label={`คันจิ ${kanji.character}`}>
        {kanji.character}
      </p>
      <Section title={TEXT.meanings}>
        <dl className="flex flex-col gap-2">
          {meanings.th.length > 0 && (
            <div>
              <dt className="text-sm text-stone-500 dark:text-neutral-400">{TEXT.thai}</dt>
              <dd lang="th" className="text-lg">{meanings.th.join(' · ')}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-stone-500 dark:text-neutral-400">{TEXT.english}</dt>
            <dd lang="en" className="text-lg">{meanings.en.length > 0 ? meanings.en.join(' · ') : TEXT.none}</dd>
          </div>
        </dl>
      </Section>
      <Section title={TEXT.readings}>
        <dl className="flex flex-col gap-2">
          <ReadingList label={TEXT.onyomi} items={groups.on} />
          <ReadingList label={TEXT.kunyomi} items={groups.kun} />
        </dl>
      </Section>
      <Section title={TEXT.facts}>
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-sm text-stone-500 dark:text-neutral-400">{TEXT.strokes}</dt>
            <dd className="text-lg" data-testid="detail-strokes">{kanji.strokeCount ?? TEXT.none}</dd>
          </div>
          <div>
            <dt className="text-sm text-stone-500 dark:text-neutral-400">{TEXT.frequency}</dt>
            <dd className="text-lg" data-testid="detail-frequency">{kanji.frequency ?? TEXT.none}</dd>
          </div>
        </dl>
      </Section>
      <Section title={TEXT.progress}>
        <p className="font-medium" data-testid="detail-kanji-status">{kanjiStatus}</p>
        <ul className="flex flex-col gap-2">
          {detail.modes.map((status) => (
            <li key={status.mode} data-testid={`detail-mode-${status.mode}`} className="flex flex-col rounded-xl border border-stone-200 p-3 dark:border-neutral-700">
              <span className="font-medium">
                {status.mode} · {MODE_INFO[status.mode].title}
                {status.state !== null && <span className="ml-2 text-sm text-stone-500 dark:text-neutral-400">{STATE_LABEL[status.state]}</span>}
              </span>
              <span className={status.due ? 'font-semibold text-red-700 dark:text-red-400' : 'text-sm'}>{modeStatusText(status, format)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/** Read-only kanji detail, opened from Search. Back returns to Search with its query intact. */
export function KanjiDetail({ kanjiId, onBack, now }: { kanjiId: string; onBack: () => void; now?: () => number }) {
  const { state, reload } = useKanjiDetail(kanjiId, now === undefined ? {} : { now });
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">รายละเอียดคันจิ · Kanji detail</h1>
        <button type="button" onClick={onBack} className={`${SECONDARY_BUTTON} min-h-11`}>
          {TEXT.back}
        </button>
      </header>
      {state.status === 'loading' && <StateMessage tone="loading" title={TEXT.loading} />}
      {state.status === 'not-found' && <StateMessage tone="empty" title={TEXT.notFound} />}
      {state.status === 'error' && (
        <StateMessage tone="error" title={TEXT.error}>
          <button type="button" className={SECONDARY_BUTTON} onClick={() => void reload()}>
            {TEXT.retry}
          </button>
        </StateMessage>
      )}
      {state.status === 'ready' && <KanjiDetailView detail={state.detail} />}
    </div>
  );
}
