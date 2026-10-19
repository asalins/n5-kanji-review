import { createAudioPlayer, type AudioElementPort, type AudioPlayer, type SpeechPort, type SpeechVoicePort } from './audioPlayer';
import { BUNDLED_CLIPS } from './clips';

/** How long to wait for asynchronously loaded speech voices (Chrome loads them after first use). */
const VOICES_TIMEOUT_MS = 1500;

function browserSpeech(): SpeechPort | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null;
  const synth = window.speechSynthesis;
  const voices = new Map<SpeechVoicePort, SpeechSynthesisVoice>();
  return {
    getVoices() {
      voices.clear();
      return synth.getVoices().map((voice) => {
        const port = { lang: voice.lang, localService: voice.localService };
        voices.set(port, voice);
        return port;
      });
    },
    voicesReady() {
      if (synth.getVoices().length > 0) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          synth.removeEventListener('voiceschanged', done);
          resolve();
        };
        synth.addEventListener('voiceschanged', done);
        setTimeout(done, VOICES_TIMEOUT_MS);
      });
    },
    speak(text, { lang, rate, voice }) {
      return new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rate;
        const native = voices.get(voice);
        if (native !== undefined) utterance.voice = native;
        utterance.onend = () => resolve();
        // a cancel (new play or stop) is not a failure
        utterance.onerror = (event) => (event.error === 'interrupted' || event.error === 'canceled' ? resolve() : reject(new Error(event.error)));
        synth.speak(utterance);
      });
    },
    cancel() {
      synth.cancel();
    },
  };
}

function browserAudioFactory(): ((src: string) => AudioElementPort) | null {
  if (typeof Audio === 'undefined') return null;
  return (src) => new Audio(src);
}

let shared: AudioPlayer | null = null;

/** The app-wide player (one sound at a time), created on first use. */
export function browserAudioPlayer(): AudioPlayer {
  shared ??= createAudioPlayer({
    clips: BUNDLED_CLIPS,
    baseUrl: import.meta.env.BASE_URL,
    createAudio: browserAudioFactory(),
    speech: browserSpeech(),
  });
  return shared;
}
