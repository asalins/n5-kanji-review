import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { FOCUS_RING } from '../../components/styles';
import { AudioUnavailableError, type AudioFailure, type AudioLang } from '../../services/audio/audioPlayer';
import { useAudio } from './AudioProvider';
import { FAILURE_TEXT, TEXT } from './strings';

type ButtonState = { status: 'idle' } | { status: 'playing' } | { status: 'error'; reason: AudioFailure };

interface PlayAudioButtonProps {
  readonly clipId: string;
  readonly speechText: string;
  /** What is heard, for the accessible name (e.g. the kana). */
  readonly label: string;
  readonly lang?: AudioLang;
  /** Shown beside the button (the text being heard); the status line goes under both. */
  readonly children?: ReactNode;
}

function SpeakerIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      {active && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}
    </svg>
  );
}

/** Play (and replay) one sound. The produced file is used when it exists, the device voice otherwise. */
export function PlayAudioButton({ clipId, speechText, label, lang = 'ja', children }: PlayAudioButtonProps) {
  const { player, rate, gender } = useAudio();
  const [state, setState] = useState<ButtonState>({ status: 'idle' });
  const mounted = useRef(true);
  const playing = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // leaving the screen (or the card) silences what this button started
      if (playing.current) player.stop();
    };
  }, [player]);

  const onClick = (event: MouseEvent) => {
    event.stopPropagation(); // never reveals or rates the card it sits on
    setState({ status: 'playing' });
    playing.current = true;
    player
      .play({ clipId, speechText, lang, rate, gender })
      .then(() => {
        playing.current = false;
        if (mounted.current) setState({ status: 'idle' });
      })
      .catch((error: unknown) => {
        playing.current = false;
        if (!mounted.current) return;
        setState({ status: 'error', reason: error instanceof AudioUnavailableError ? error.reason : 'failed' });
      });
  };

  return (
    <span className="inline-flex min-w-0 max-w-full flex-col items-start">
      <span className="inline-flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onClick}
          aria-label={TEXT.play(label)}
          data-testid="play-audio"
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 active:bg-stone-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:active:bg-neutral-700 ${FOCUS_RING}`}
        >
          <SpeakerIcon active={state.status === 'playing'} />
        </button>
        {children}
      </span>
      {/* always in the tree (an empty live region has no height), so screen readers announce changes */}
      <span role="status" className="max-w-full text-xs text-stone-600 dark:text-neutral-400">
        {state.status === 'playing' ? TEXT.playing : state.status === 'error' ? FAILURE_TEXT[state.reason] : ''}
      </span>
    </span>
  );
}
