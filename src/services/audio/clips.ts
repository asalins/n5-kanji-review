import type { AudioClip } from './manifest';

/**
 * Bundled clip list. Empty until the Owner approves Audio Gate 1 and files are produced
 * (docs/media/audio-spec.md). Until then every play button uses the device's speech voice.
 * Entries are appended by the generation script, never edited by hand.
 */
export const BUNDLED_CLIPS: readonly AudioClip[] = [];
