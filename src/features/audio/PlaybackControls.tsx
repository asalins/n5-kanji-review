import { useId } from 'react';
import { FOCUS_RING } from '../../components/styles';
import { PLAYBACK_RATES } from '../../services/audio/audioPlayer';
import { VOICE_GENDERS, type VoiceGender } from '../../services/audio/manifest';
import { useAudio } from './AudioProvider';
import { TEXT } from './strings';

const GENDER_LABEL: Record<VoiceGender, string> = { female: TEXT.female, male: TEXT.male };

function Choice({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`min-h-11 min-w-14 rounded-lg border px-3 text-sm font-medium ${
        selected
          ? 'border-red-700 bg-red-700 text-white dark:border-red-400 dark:bg-red-400 dark:text-neutral-900'
          : 'border-stone-300 bg-white text-stone-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100'
      } ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

/** Speed for every play button; the voice switch appears only when some clip on screen exists in both voices. */
export function PlaybackControls({ clipIds }: { clipIds: readonly string[] }) {
  const { player, rate, setRate, gender, setGender } = useAudio();
  const speedId = useId();
  const voiceId = useId();
  const bothVoices = clipIds.some((id) => new Set(player.gendersFor(id)).size === VOICE_GENDERS.length);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="group" aria-labelledby={speedId} className="flex items-center gap-2">
        <span id={speedId} className="text-sm text-stone-500 dark:text-neutral-400">
          {TEXT.speed}
        </span>
        {PLAYBACK_RATES.map((value) => (
          <Choice key={value} selected={rate === value} onSelect={() => setRate(value)}>
            {`${value}x`}
          </Choice>
        ))}
      </div>
      {bothVoices && (
        <div role="group" aria-labelledby={voiceId} className="flex items-center gap-2">
          <span id={voiceId} className="text-sm text-stone-500 dark:text-neutral-400">
            {TEXT.voice}
          </span>
          {VOICE_GENDERS.map((value) => (
            <Choice key={value} selected={gender === value} onSelect={() => setGender(value)}>
              {GENDER_LABEL[value]}
            </Choice>
          ))}
        </div>
      )}
    </div>
  );
}
