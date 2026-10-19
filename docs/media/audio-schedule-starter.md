# Audio production schedule — ElevenLabs Starter

Status: plan, waiting on the Owner's upgrade and Gate 1 approval. Nothing generated beyond Gate 1.

## Facts the plan is built on
- Starter: 30,000 credits per **billing cycle (monthly)**. There is no daily reset. Unused credits roll over up to 2× the monthly quota while staying on the same plan; they are lost on downgrade/cancel.
- Cost observed in Gate 1 (`eleven_v4`): about 1 credit per character of TTS input (`あ。` = 2, 17 chars = 17).
- So the **daily budget is self-imposed**: 30,000 / 30 ≈ **1,000 credits/day** = 900 for generation + 100 reserve for retakes/QA. An unused day is not lost (rollover).
- One take per item after Gate 1 (4 takes only for the gate). No parallel requests (Gate 1 hit HTTP 429).

## Volumes
| Content | Source | TTS characters |
|---|---|---|
| N5 kanji readings (810: 307 on, 503 kun) | `data/kanji/n5.json`, counted | **2,639** (measured) |
| Kana (≈208 items × 2 voices) | standard kana table | ~1,250 |
| N5 vocabulary (~800) | not in the dataset yet → **BLOCKED** on verified content | ~4,800 |
| N5 example sentences (~800 × ~20) | not in the dataset yet → **BLOCKED** | ~16,000 |
| Minna no Nihongo book 1, L1–25 (examples + dialogues) | content + licence not ready → **BLOCKED** | ~16,300 |
| Thai explanations (25 lessons × ~5 × ~120) | to be written and reviewed | ~15,000 |
| Game feedback (~50 short clips) | to be written | ~500 |
| Retakes after QA (~10%) | | ~5,600 |
| **N5 phase total** | | **≈ 62,000 – 80,000** |

## Daily plan (cycle = 30 days, ≈1,000 credits/day)

**Cycle 1**
| Day | Work | Credits |
|---|---|---|
| 1 | Gate 1 remainder: items 3, 4, 5b, 6 (4 takes each) → **stop, Owner listens and approves** | ~640 |
| 2–3 | Kana: hiragana then katakana, female + male (after approval) | ~1,250 |
| 4–6 | N5 kanji readings, main voice (≈880/day) | ~2,640 |
| 7–12 | N5 vocabulary (needs verified list first) | ~4,800 |
| 13–30 | N5 example sentences (≈890/day) | ~16,000 |
| | Cycle total | **~25,300** (≈4,700 rolls over) |

**Cycle 2**
| Day | Work | Credits |
|---|---|---|
| 1–17 | Minna book 1: example sentences, then dialogues (one voice per role) | ~16,300 |
| 18–30 | Thai explanations, lessons 1–13 | ~13,000 |
| | Cycle total | **~29,300** |

**Cycle 3**
| Day | Work | Credits |
|---|---|---|
| 1–3 | Thai explanations, lessons 14–25 | ~2,000 + |
| 4 | Game feedback clips | ~500 |
| 5–12 | Retakes from QA | ~5,600 |
| | Spare for N4 start | rest |

N5 finishes in **about 3 cycles (≈3 months, ≈$18)** if the content is ready on time. The real constraint is the BLOCKED content (vocabulary, sentences, Minna, Thai texts), not the credits.

## After N5
Full course, one voice ≈ 515,000 credits. On Starter: ≈ 17 more cycles (≈ 1.5 years, ≈ $100). On Pro: 1 month, $99. Decide at the end of N5.

## Daily routine
1. Owner (or the usage page) confirms remaining credits; the API key stays on the generation machine.
2. Run the day's batch sequentially; skip items whose `hash` already exists.
3. Spot-listen + transcription check on a sample; failures go into the retake list.
4. Append to the manifest and a usage log: date, items, credits, failures.
5. Stop at the day's budget; never start the next day's batch early unless the Owner says so.
