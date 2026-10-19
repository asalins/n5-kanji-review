import { describe, expect, it, vi } from 'vitest';
import {
  AudioUnavailableError,
  createAudioPlayer,
  type AudioElementPort,
  type PlayRequest,
  type SpeechPort,
  type SpeechVoicePort,
} from '../../../src/services/audio/audioPlayer';
import { readingClipId, readingSpeechText } from '../../../src/services/audio/clipIds';
import { BUNDLED_CLIPS } from '../../../src/services/audio/clips';
import { parseAudioManifest, type AudioClip } from '../../../src/services/audio/manifest';

const clip = (over: Partial<AudioClip> = {}): AudioClip => ({
  id: 'reading:kanji:U+5B66:on:ガク',
  text: '学',
  reading: 'がく',
  ttsInput: 'がく',
  lang: 'ja',
  gender: 'female',
  voiceId: 'v1',
  voiceName: 'Sakura',
  model: 'eleven_v4',
  path: 'audio/kanji/5b66-on-gaku-f.mp3',
  hash: 'a'.repeat(64),
  version: 1,
  ...over,
});

const request = (over: Partial<PlayRequest> = {}): PlayRequest => ({
  clipId: 'reading:kanji:U+5B66:on:ガク',
  speechText: 'ガク',
  lang: 'ja',
  rate: 1,
  gender: 'female',
  ...over,
});

/** Fake <audio>: 'ok' ends right away, 'error' fires error, 'reject' rejects play(), 'hang' never ends. */
function fakeAudio(behaviour: 'ok' | 'error' | 'reject' | 'hang') {
  const created: { src: string; el: AudioElementPort & { paused: boolean } }[] = [];
  const factory = (src: string) => {
    const listeners: Record<string, () => void> = {};
    const el = {
      playbackRate: 1,
      preservesPitch: false,
      paused: false,
      play: () => {
        if (behaviour === 'reject') return Promise.reject(new Error('NotAllowedError'));
        queueMicrotask(() => {
          if (behaviour === 'ok') listeners.ended?.();
          if (behaviour === 'error') listeners.error?.();
        });
        return Promise.resolve();
      },
      pause() {
        el.paused = true;
      },
      addEventListener(type: 'ended' | 'error', listener: () => void) {
        listeners[type] = listener;
      },
    };
    created.push({ src, el });
    return el;
  };
  return { factory, created };
}

function fakeSpeech(voices: SpeechVoicePort[], { lateVoices }: { lateVoices?: SpeechVoicePort[] } = {}) {
  let list = voices;
  const spoken: { text: string; lang: string; rate: number; voice: SpeechVoicePort }[] = [];
  const port: SpeechPort & { cancel: ReturnType<typeof vi.fn<() => void>> } = {
    getVoices: () => list,
    voicesReady: () => {
      if (lateVoices) list = lateVoices;
      return Promise.resolve();
    },
    speak: (text, options) => {
      spoken.push({ text, ...options });
      return Promise.resolve();
    },
    cancel: vi.fn<() => void>(),
  };
  return { port, spoken };
}

const JA = { lang: 'ja-JP', localService: true };
const EN = { lang: 'en-US', localService: true };

describe('audio player: produced file first, device voice as fallback', () => {
  it('plays the produced file at the chosen speed with pitch preserved', async () => {
    const audio = fakeAudio('ok');
    const speech = fakeSpeech([JA]);
    const player = createAudioPlayer({ clips: [clip()], baseUrl: '/', createAudio: audio.factory, speech: speech.port });
    await expect(player.play(request({ rate: 0.75 }))).resolves.toBe('file');
    expect(audio.created).toHaveLength(1);
    expect(audio.created[0]!.src).toBe('/audio/kanji/5b66-on-gaku-f.mp3');
    expect(audio.created[0]!.el.playbackRate).toBe(0.75);
    expect(audio.created[0]!.el.preservesPitch).toBe(true);
    expect(speech.spoken).toEqual([]);
  });

  it('chooses the requested voice when both exist, otherwise the one that exists', async () => {
    const audio = fakeAudio('ok');
    const male = clip({ gender: 'male', path: 'audio/kanji/5b66-on-gaku-m.mp3' });
    const player = createAudioPlayer({ clips: [clip(), male], baseUrl: '/', createAudio: audio.factory, speech: null });
    await player.play(request({ gender: 'male' }));
    expect(audio.created[0]!.src).toBe('/audio/kanji/5b66-on-gaku-m.mp3');
    expect(player.gendersFor(male.id)).toEqual(['female', 'male']);

    const onlyFemale = createAudioPlayer({ clips: [clip()], baseUrl: '/', createAudio: audio.factory, speech: null });
    await onlyFemale.play(request({ gender: 'male' }));
    expect(audio.created[1]!.src).toBe('/audio/kanji/5b66-on-gaku-f.mp3');
  });

  it.each(['error', 'reject'] as const)('falls back to the device voice when the file fails (%s)', async (behaviour) => {
    const audio = fakeAudio(behaviour);
    const speech = fakeSpeech([JA]);
    const player = createAudioPlayer({ clips: [clip()], baseUrl: '/', createAudio: audio.factory, speech: speech.port });
    await expect(player.play(request())).resolves.toBe('device');
    expect(speech.spoken).toEqual([{ text: 'ガク', lang: 'ja-JP', rate: 1, voice: JA }]);
  });

  it('uses the device voice when no file exists (current state: no clips)', async () => {
    const speech = fakeSpeech([EN, JA]);
    const player = createAudioPlayer({ clips: [], baseUrl: '/', createAudio: fakeAudio('ok').factory, speech: speech.port });
    await expect(player.play(request({ rate: 1.25 }))).resolves.toBe('device');
    expect(speech.spoken[0]).toMatchObject({ lang: 'ja-JP', rate: 1.25, voice: JA });
  });

  it('waits for voices that load late', async () => {
    const speech = fakeSpeech([], { lateVoices: [JA] });
    const player = createAudioPlayer({ clips: [], baseUrl: '/', createAudio: null, speech: speech.port });
    await expect(player.play(request())).resolves.toBe('device');
  });

  it('never reads Japanese with a voice of another language: reports no-voice', async () => {
    const speech = fakeSpeech([EN]);
    const player = createAudioPlayer({ clips: [], baseUrl: '/', createAudio: null, speech: speech.port });
    await expect(player.play(request())).rejects.toEqual(new AudioUnavailableError('no-voice'));
    expect(speech.spoken).toEqual([]);
  });

  it('reports unsupported when there is neither a file nor speech', async () => {
    const player = createAudioPlayer({ clips: [], baseUrl: '/', createAudio: null, speech: null });
    await expect(player.play(request())).rejects.toMatchObject({ reason: 'unsupported' });
  });

  it('one sound at a time: a new play stops the previous one and settles its promise', async () => {
    const audio = fakeAudio('hang');
    const speech = fakeSpeech([JA]);
    const player = createAudioPlayer({ clips: [clip()], baseUrl: '/', createAudio: audio.factory, speech: speech.port });
    const first = player.play(request());
    await Promise.resolve();
    const second = player.play(request());
    await expect(first).resolves.toBe('file');
    expect(audio.created[0]!.el.paused).toBe(true);
    expect(speech.port.cancel).toHaveBeenCalled();
    player.stop();
    await expect(second).resolves.toBe('file');
  });
});

describe('clip ids and spoken text', () => {
  it('builds stable ids per kanji, reading type and kana', () => {
    expect(readingClipId('kanji:U+5B66', 'kun', 'まな.ぶ')).toBe('reading:kanji:U+5B66:kun:まな.ぶ');
  });
  it('speaks the reading without KANJIDIC2 notation marks', () => {
    expect(readingSpeechText('まな.ぶ')).toBe('まなぶ');
    expect(readingSpeechText('-み')).toBe('み');
    expect(readingSpeechText('みず-')).toBe('みず');
    expect(readingSpeechText('ガク')).toBe('ガク');
  });
});

describe('manifest', () => {
  it('the bundled clip list is valid (empty until Audio Gate 1 is approved)', () => {
    expect(parseAudioManifest(BUNDLED_CLIPS)).toEqual(BUNDLED_CLIPS);
  });
  it('rejects duplicates, unknown fields and non-ASCII or non-mp3 paths', () => {
    expect(() => parseAudioManifest([clip(), clip()])).toThrow(/duplicate/);
    expect(() => parseAudioManifest([{ ...clip(), extra: 1 }])).toThrow();
    expect(() => parseAudioManifest([clip({ path: 'audio/学.mp3' })])).toThrow();
    expect(() => parseAudioManifest([clip({ path: 'audio/a.wav' })])).toThrow();
    expect(() => parseAudioManifest([clip({ path: '../secret.mp3' })])).toThrow();
    expect(parseAudioManifest([clip(), clip({ gender: 'male' })])).toHaveLength(2);
  });
});
