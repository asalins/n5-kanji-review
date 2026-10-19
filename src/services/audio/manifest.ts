import { z } from 'zod';

/**
 * Pre-generated audio clips (ElevenLabs or recorded). One entry per file; the app never calls a TTS API.
 * `ttsInput` is the exact text the file speaks (a verified reading in kana), `text` is what the UI shows.
 * Files live under `public/` at `path`; the list itself is bundled so lookups work offline.
 */
export const VOICE_GENDERS = ['female', 'male'] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export const AudioClipSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    reading: z.string().min(1),
    ttsInput: z.string().min(1),
    lang: z.enum(['ja', 'th']),
    gender: z.enum(VOICE_GENDERS),
    voiceId: z.string().min(1),
    voiceName: z.string().min(1),
    model: z.string().min(1),
    // ASCII only (files are named by hash), so URLs never need encoding
    path: z.string().regex(/^audio\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.mp3$/),
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    version: z.number().int().positive(),
  })
  .strict();

export type AudioClip = z.infer<typeof AudioClipSchema>;

export const AudioManifestSchema = z
  .array(AudioClipSchema)
  .superRefine((clips, ctx) => {
    const seen = new Set<string>();
    for (const clip of clips) {
      const key = `${clip.id}|${clip.gender}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', message: `duplicate clip ${key}` });
      seen.add(key);
    }
  });

export function parseAudioManifest(input: unknown): readonly AudioClip[] {
  return AudioManifestSchema.parse(input);
}
