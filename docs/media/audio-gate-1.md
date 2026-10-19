# Audio Gate 1 — sample set (2026-10-19)

Result: **BLOCKED (partial).** 3 of 6 items have takes; 3 were not generated because ElevenLabs disabled the account's Free Tier during the run:
"Unusual activity has been detected on your account, so Free Tier access has been disabled. This can be triggered by using a proxy or VPN, or by creating multiple free accounts. Please upgrade to a paid subscription to continue."
(The run came from a cloud container behind a proxy, which is a likely trigger.) A few requests also hit HTTP 429 (concurrency limit) before the block.

ElevenLabs flow: "NihongoBrain – Audio Gate 1 (samples)" (`eLotmM6We3kUFCiBvkpt`). Model `eleven_v4`. The files are not committed (they wait for approval and licence confirmation).

| # | Item | TTS input | Voice | Result | Credits |
|---|---|---|---|---|---|
| 1 | Hiragana あ | `あ。` | Sakura – Professional Japanese Narration (`EGPLqH9Wz2tNLu58EJVR`, female) | 2 takes (0.56 s, 0.88 s) | 4 |
| 2 | Kanji 学 | `おんよみ、がく。くんよみ、まなぶ。` | Hiro – 初心者に寄り添う日本語講師 (`M7qFsr6YHaHlccThJ7Q9`, male) | 2 takes (4.8 s, 4.08 s) | 34 |
| 3 | 学校（がっこう） | `がっこう。` | Sakura | BLOCKED (account) | 0 |
| 4 | 私は学生です。 | `わたしは学生です。` | Hiro | BLOCKED (account) | 0 |
| 5a | Dialogue, F | `はじめまして。やまだです。どうぞよろしく。` | Sakura | 2 takes (4.16 s, 4.56 s) | 42 |
| 5b | Dialogue, M | `はじめまして。たなかです。よろしくおねがいします。` | Hiro | BLOCKED (account) | 0 |
| 6 | Thai explanation | `ประโยค วาตาชิ วะ กักเซย์ เดส แปลว่า ฉันเป็นนักเรียน. คำช่วย วะ บอกว่าเรากำลังพูดถึงใคร ส่วน เดส ใช้ลงท้ายประโยคให้สุภาพ.` | Kanya – Warm, Calm Narrator (`B4NdgwdU97lHqA8Udh2D`, Thai female) | NOT EXECUTED (429, then account block) | 0 |

Credits used: 80 for completed takes (failed takes are listed by the service with a price but produced no audio; confirm in the ElevenLabs usage page whether they were charged). Pre-run estimate for item 6 alone: 480 credits for 4 takes.

Checks: pronunciation, naturalness and N5 speed = **NOT EXECUTED** (Owner listening pending). Automatic transcription check = NOT EXECUTED (account blocked).

File hashes (SHA-256):
```
4e1995d5328e9e48535503ff0ee9b3929f876e21df8b96fe0f726c373a34084a  01-hiragana-a_sakura_take1.mp3
6529720c2e4cbfd73f6733c6cb9ec676d63dc91845b670b985a0525e16b87ba9  01-hiragana-a_sakura_take2.mp3
a609bcfaaedc5964da3072813894476220d9a99caddf69c8db2513201af9ccce  02-kanji-gaku_hiro_take1.mp3
1795b01ddb02acc1002e121a29904e032d1ecdadccfd2b8f028761eb9aa93422  02-kanji-gaku_hiro_take2.mp3
3efeabecc0402e4400f013ff135f65ff3d9206e62a4d90e31f44b4f092a9a167  05a-dialogue-yamada_sakura_take1.mp3
fc1666cc28117ae37a5c87d097118120b6f455a744ae1496238fed1ec1754dc8  05a-dialogue-yamada_sakura_take2.mp3
```

## To unblock
1. Owner: upgrade ElevenLabs to a paid plan (needed anyway for commercial use) or resolve the flag with ElevenLabs support.
2. Re-run items 3, 4, 5b, 6 one at a time (no parallel requests), then the transcription check.
3. Owner listens to all 6 and picks one take per item + confirms the main voices.
