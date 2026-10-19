import type { AudioClip, VoiceGender } from './manifest';

/** Playback speeds offered to learners (spec: 0.75x / 1x / 1.25x). */
export const PLAYBACK_RATES = [0.75, 1, 1.25] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export type AudioLang = 'ja' | 'th';

export interface PlayRequest {
  readonly clipId: string;
  /** Kana (or Thai) text for the device voice when no file exists or the file fails. */
  readonly speechText: string;
  readonly lang: AudioLang;
  readonly rate: PlaybackRate;
  readonly gender: VoiceGender;
}

/** Where the sound came from: the produced file, or the device's speech voice (fallback). */
export type PlaySource = 'file' | 'device';

export type AudioFailure = 'no-voice' | 'unsupported' | 'failed';

export class AudioUnavailableError extends Error {
  constructor(readonly reason: AudioFailure) {
    super(`audio unavailable: ${reason}`);
    this.name = 'AudioUnavailableError';
  }
}

/** The subset of HTMLAudioElement the player needs (a port, so tests need no real media). */
export interface AudioElementPort {
  playbackRate: number;
  preservesPitch: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'ended' | 'error', listener: () => void): void;
}

export interface SpeechVoicePort {
  readonly lang: string;
  readonly localService: boolean;
}

export interface SpeechPort {
  getVoices(): readonly SpeechVoicePort[];
  /** Resolves when voices are known (some browsers load them asynchronously). */
  voicesReady(): Promise<void>;
  speak(text: string, options: { lang: string; rate: number; voice: SpeechVoicePort }): Promise<void>;
  cancel(): void;
}

export interface AudioPlayerPorts {
  readonly clips: readonly AudioClip[];
  /** Base URL for clip paths, normally import.meta.env.BASE_URL. */
  readonly baseUrl: string;
  readonly createAudio: ((src: string) => AudioElementPort) | null;
  readonly speech: SpeechPort | null;
}

export interface AudioPlayer {
  play(request: PlayRequest): Promise<PlaySource>;
  stop(): void;
  /** Genders that have a produced file for this clip (empty = device voice only). */
  gendersFor(clipId: string): readonly VoiceGender[];
}

const SPEECH_LANG: Record<AudioLang, string> = { ja: 'ja-JP', th: 'th-TH' };

function pickVoice(voices: readonly SpeechVoicePort[], lang: AudioLang): SpeechVoicePort | null {
  const matching = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  return matching.find((v) => v.localService) ?? matching[0] ?? null;
}

export function createAudioPlayer(ports: AudioPlayerPorts): AudioPlayer {
  const byId = new Map<string, AudioClip[]>();
  for (const clip of ports.clips) byId.set(clip.id, [...(byId.get(clip.id) ?? []), clip]);

  let current: AudioElementPort | null = null;
  /** Settles the pending file playback when it is stopped, so a caller never waits for an 'ended' that will not come. */
  let settleCurrent: (() => void) | null = null;

  function stop(): void {
    current?.pause();
    current = null;
    settleCurrent?.();
    settleCurrent = null;
    ports.speech?.cancel();
  }

  function playFile(clip: AudioClip, rate: PlaybackRate): Promise<void> {
    if (ports.createAudio === null) return Promise.reject(new AudioUnavailableError('unsupported'));
    const audio = ports.createAudio(`${ports.baseUrl}${clip.path}`);
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    current = audio;
    return new Promise<void>((resolve, reject) => {
      settleCurrent = resolve;
      audio.addEventListener('ended', () => resolve());
      audio.addEventListener('error', () => reject(new AudioUnavailableError('failed')));
      audio.play().catch(() => reject(new AudioUnavailableError('failed')));
    });
  }

  async function playDevice(request: PlayRequest): Promise<void> {
    const speech = ports.speech;
    if (speech === null) throw new AudioUnavailableError('unsupported');
    let voice = pickVoice(speech.getVoices(), request.lang);
    if (voice === null) {
      await speech.voicesReady();
      voice = pickVoice(speech.getVoices(), request.lang);
    }
    // Never read Japanese with a voice of another language: say so instead.
    if (voice === null) throw new AudioUnavailableError('no-voice');
    try {
      await speech.speak(request.speechText, { lang: SPEECH_LANG[request.lang], rate: request.rate, voice });
    } catch {
      throw new AudioUnavailableError('failed');
    }
  }

  return {
    async play(request) {
      stop();
      const clips = byId.get(request.clipId) ?? [];
      const clip = clips.find((c) => c.gender === request.gender) ?? clips[0];
      if (clip !== undefined) {
        try {
          await playFile(clip, request.rate);
          return 'file';
        } catch {
          // fall through to the device voice (spec: TTS fallback when the main audio cannot play)
        }
      }
      await playDevice(request);
      return 'device';
    },
    stop,
    gendersFor(clipId) {
      return (byId.get(clipId) ?? []).map((c) => c.gender);
    },
  };
}
