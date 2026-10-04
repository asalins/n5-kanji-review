import { useEffect, useRef } from 'react';
import { StateMessage } from '../../components/StateMessage';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/styles';
import { Flashcard } from '../flashcards/Flashcard';
import { RatingButtons } from '../flashcards/RatingButtons';
import { MODE_INFO } from '../flashcards/strings';
import { useCardKeyboard } from '../flashcards/useCardKeyboard';
import { ERROR_TEXT, formatAccuracy, formatDuration } from './reviewStrings';
import type { ReviewOrchestrator } from './reviewBoundary';
import type { DailyLimits } from '../../services/session/allowance';
import { useReviewSession } from './useReviewSession';

interface ReviewSessionProps {
  readonly onExit: () => void;
  readonly now?: () => number;
  readonly limits?: DailyLimits;
  readonly orchestrator?: ReviewOrchestrator;
}

/** Today's review: due cards first, then new cards from the project list. The UI only shows and forwards ratings. */
export function ReviewSession({ onExit, now, limits, orchestrator }: ReviewSessionProps) {
  const { state, start, reveal, rate, restart } = useReviewSession({ now, limits, orchestrator });
  const answerRef = useRef<HTMLDivElement>(null);
  const reviewing = state.status === 'REVIEWING' ? state : null;

  useCardKeyboard({
    enabled: reviewing !== null && !reviewing.saving,
    phase: reviewing?.phase ?? 'front',
    onReveal: reveal,
    onRate: (rating) => void rate(rating),
  });
  useEffect(() => {
    if (reviewing?.phase === 'revealed') answerRef.current?.focus();
  }, [reviewing?.phase, reviewing?.index]);

  const header = (
    <header className="flex items-center justify-between gap-3">
      <button type="button" onClick={onExit} className={`${SECONDARY_BUTTON} min-h-11`}>
        ← Home
      </button>
      <h1 className="text-base font-semibold">ทบทวนวันนี้ · Today's review</h1>
    </header>
  );

  switch (state.status) {
    case 'IDLE':
    case 'LOADING':
      return <>{header}<StateMessage tone="loading" title="กำลังเตรียมรอบทบทวน…" /></>;
    case 'ERROR':
      return (
        <>
          {header}
          <StateMessage tone="error" title={ERROR_TEXT[state.code].title} description={ERROR_TEXT[state.code].description}>
            <button type="button" onClick={() => void restart()} className={PRIMARY_BUTTON}>
              ลองอีกครั้ง
            </button>
          </StateMessage>
        </>
      );
    case 'EMPTY':
      return (
        <>
          {header}
          {state.reason === 'LIMITS_REACHED' ? (
            <StateMessage tone="empty" title="ครบโควตาของวันนี้แล้ว" description="ยังมีการ์ดเหลือ แต่ถึงจำนวนที่ตั้งไว้ต่อวันแล้ว กลับมาใหม่พรุ่งนี้">
              <button type="button" onClick={onExit} className={PRIMARY_BUTTON}>กลับหน้าหลัก</button>
            </StateMessage>
          ) : (
            <StateMessage tone="empty" title="ไม่มีการ์ดให้ทบทวนตอนนี้" description="ไม่มีการ์ดที่ถึงกำหนด และไม่มีคันจิใหม่ให้เรียน">
              <button type="button" onClick={onExit} className={PRIMARY_BUTTON}>กลับหน้าหลัก</button>
            </StateMessage>
          )}
        </>
      );
    case 'READY': {
      const due = state.cards.filter((c) => c.planned.kind === 'due').length;
      return (
        <>
          {header}
          <StateMessage tone="empty" title={`${state.cards.length} ใบในรอบนี้`} description={`ทบทวน ${due} ใบ · ใหม่ ${state.cards.length - due} ใบ`}>
            <button type="button" onClick={() => void start()} className={PRIMARY_BUTTON}>
              เริ่ม · Start
            </button>
          </StateMessage>
        </>
      );
    }
    case 'COMPLETED': {
      const s = state.summary;
      return (
        <>
          {header}
          <StateMessage tone="empty" title="จบรอบทบทวนแล้ว" description={`ทบทวนแล้ว ${s.completed} จาก ${s.total} ใบ`}>
            <dl className="grid grid-cols-2 gap-2 text-left">
              {[
                ['Again', s.again], ['Hard', s.hard], ['Good', s.good], ['Easy', s.easy],
                ['ความแม่นยำ', formatAccuracy(s.accuracy)], ['เวลา', formatDuration(s.durationMs)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-stone-100 px-3 py-2 dark:bg-neutral-800">
                  <dt className="text-sm text-stone-500 dark:text-neutral-400">{label}</dt>
                  <dd className="text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {!state.sessionSaved && (
              <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
                บันทึกสรุปรอบนี้ไม่สำเร็จ (ผลของแต่ละใบถูกบันทึกแล้ว)
              </p>
            )}
            <button type="button" onClick={() => void restart()} className={PRIMARY_BUTTON}>รอบถัดไป · Next round</button>
            <button type="button" onClick={onExit} className={SECONDARY_BUTTON}>กลับหน้าหลัก</button>
          </StateMessage>
        </>
      );
    }
    case 'REVIEWING': {
      const card = state.cards[state.index];
      if (card === undefined) return null;
      const total = state.cards.length;
      const mode = card.planned.card.mode;
      return (
        <>
          {header}
          <div className="flex flex-col gap-1" aria-label="Progress">
            <p className="text-sm text-stone-600 dark:text-neutral-400">
              Card {state.index + 1} of {total} · {card.planned.kind === 'due' ? 'ทบทวน' : 'ใหม่'} · {mode} {MODE_INFO[mode].title}
            </p>
            <div
              role="progressbar"
              aria-label="Session progress"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={state.index}
              className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-neutral-700"
            >
              <div className="h-full bg-red-700 dark:bg-red-400" style={{ width: `${(state.index / total) * 100}%` }} />
            </div>
          </div>
          <div ref={answerRef} tabIndex={-1} className="flex w-full flex-1 flex-col items-center outline-none">
            <Flashcard mode={mode} data={card.data} phase={state.phase} onReveal={reveal} />
          </div>
          {state.saveError !== null && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950 dark:text-red-200">
              {ERROR_TEXT[state.saveError].title}: {ERROR_TEXT[state.saveError].description}
            </p>
          )}
          <div>
            {state.phase === 'front' ? (
              <button type="button" onClick={reveal} aria-keyshortcuts="Space Enter" className={PRIMARY_BUTTON}>
                Show answer · ดูคำตอบ
              </button>
            ) : (
              <RatingButtons onRate={(rating) => void rate(rating)} disabled={state.saving} />
            )}
          </div>
        </>
      );
    }
  }
}
