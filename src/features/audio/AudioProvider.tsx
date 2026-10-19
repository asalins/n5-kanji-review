import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AudioPlayer, PlaybackRate } from '../../services/audio/audioPlayer';
import { browserAudioPlayer } from '../../services/audio/browserAudio';
import type { VoiceGender } from '../../services/audio/manifest';

interface AudioContextValue {
  readonly player: AudioPlayer;
  readonly rate: PlaybackRate;
  readonly setRate: (rate: PlaybackRate) => void;
  readonly gender: VoiceGender;
  readonly setGender: (gender: VoiceGender) => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

/**
 * Speed and voice live in memory for the session only: storing them would change the synced/backed-up
 * settings contract, which needs its own approval.
 */
export function AudioProvider({ player, children }: { player?: AudioPlayer; children: ReactNode }) {
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [gender, setGender] = useState<VoiceGender>('female');
  const resolved = useMemo(() => player ?? browserAudioPlayer(), [player]);
  const value = useMemo(() => ({ player: resolved, rate, setRate, gender, setGender }), [resolved, rate, gender]);
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

const fallbackState = { rate: 1 as PlaybackRate, gender: 'female' as VoiceGender, setRate: () => {}, setGender: () => {} };

/** Works without a provider too (default speed and voice), so any screen can show a play button. */
export function useAudio(): AudioContextValue {
  const value = useContext(AudioContext);
  return value ?? { player: browserAudioPlayer(), ...fallbackState };
}
