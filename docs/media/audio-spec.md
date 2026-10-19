# NihongoBrain — Audio specification (ElevenLabs)

Status: **requirement recorded, not implemented.** No audio is integrated into the app. Production unchanged.
Source: Coordinator instruction "ElevenLabs Audio Generation Requirement" (REQUIRED), relayed by the Owner, 2026-10-19.

Learning path: see image → listen → read furigana → practise speaking → exercise.

## 1. Coverage

| Area | Audio |
|---|---|
| Kana Palace | Each hiragana / katakana |
| Kanji Garden N5–N1 | On'yomi, kun'yomi, example words |
| Minna no Nihongo grammar (4 books) | Example sentences, dialogues |
| Dictionary / Word Detail | Reading of the word |
| Flashcards / SRS | Front side + example sentence |
| Exercise games (5 sets) | Question, answer, correct/wrong, level clear, reward |
| Main lessons | Thai explanation only where it helps |

## 2. Voice standard

- Natural, clear Japanese for learners; one main female and one main male teacher voice for the whole course; extra character voices only for dialogues and games.
- Normal speed file per item. Slow (0.75x) and 1.25x come from the player (`playbackRate` with `preservesPitch`); a separately generated slow file only where the Owner finds player-slowed audio unclear.
- **TTS input is the verified reading, never a guess.** Kanji items are synthesised from kana (`がく`, `まなぶ`); sentences use kana where a word has several readings (私 → わたし). The display text (with kanji and furigana) is stored separately.
- Thai explanations use a separate Thai voice; Japanese words inside Thai text are written in Thai script so the Thai voice does not read kana.
- Every clip is checked against kana/furigana and context before use: automatic transcription check + Owner listening for the gate set.

## 3. Generation workflow (offline, never at play time)

1. Prepare text + verified reading (from the dataset, `reviewed: true` only).
2. Voice profile + model (current gate: `eleven_v4`).
3. Sample set → Owner approval (Gate 1, below). **No bulk generation before approval.**
4. Bulk run by a server-side/CLI script that reads the API key from the environment (never `VITE_*`, never committed), checks remaining credits first, skips items whose `hash` already exists.
5. Output MP3 (44.1 kHz mono; target ≤ 64 kbps for the app bundle after transcoding).
6. Manifest per item:

```json
{ "id": "kanji-学-onyomi", "text": "学", "reading": "がく", "ttsInput": "がく",
  "lang": "ja", "voiceId": "…", "voiceName": "…", "model": "eleven_v4",
  "path": "audio/kanji/学-onyomi.f.mp3", "speed": 1, "hash": "sha256(ttsInput|voiceId|model|settings)",
  "version": 1, "approvedBy": null, "createdAt": "…" }
```

## 4. Audio player (app)

Play / replay, speed 0.75x · 1x · 1.25x, male/female switch when both files exist, furigana shown with the text being heard, loading and error states, offline from cache, and fallback to the browser's Japanese speech (`speechSynthesis`, `ja-JP`) when the file is missing (fallback marked as lower quality; never used for kanji where the reading is ambiguous unless given kana).
Caching: audio is not precached in the service worker by default (size); cache on first play or by an explicit "download lesson audio" action. Size budget to be measured before deciding.

## 5. Security / licence / cost

- API key only on the generation machine/CI secret; the browser only loads static MP3s.
- Commercial use requires a **paid ElevenLabs plan** (free tier is non-commercial and requires attribution). Library voices may have extra terms set by the voice owner; check each chosen voice before production.
- Re-use by `hash`; never regenerate identical content.
- Credits are checked and reported before every batch.

## 6. Gate 1 (sample approval)

See `audio-gate-1.md`.
