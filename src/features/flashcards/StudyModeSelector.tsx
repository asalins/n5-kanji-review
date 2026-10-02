import { STUDY_MODES, type StudyMode } from '../../types/entities';
import { SECONDARY_BUTTON } from '../../components/styles';
import { MODE_INFO } from './strings';

export function StudyModeSelector({ onSelect }: { onSelect: (mode: StudyMode) => void }) {
  return (
    <ul className="flex w-full max-w-md flex-col gap-3">
      {STUDY_MODES.map((mode) => (
        <li key={mode}>
          <button
            type="button"
            onClick={() => onSelect(mode)}
            className={`${SECONDARY_BUTTON} flex min-h-20 w-full flex-col items-start justify-center text-left`}
          >
            <span className="text-lg font-semibold">
              {mode} · {MODE_INFO[mode].title}
            </span>
            <span className="text-sm font-normal text-stone-600 dark:text-neutral-400">{MODE_INFO[mode].subtitle}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
