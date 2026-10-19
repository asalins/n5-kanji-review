---
name: monetize-language-learning
description: Design and build paid memberships and one-time unlocks for the N5 Kanji Review language-learning app - free vs premium split, pricing, paywall, entitlements in Firebase, Thai QR / PromptPay payment through KBANK (K API QR Payment or PromptPay QR + slip verification) with real server-side payment confirmation, Google Play Billing for the Android app, receipts, refunds and PDPA. Use when asked about subscriptions, membership, premium, paywall, unlocking features, pricing, QR payment, KBank/K PLUS, PromptPay, slip checking, or verifying that a payment really happened.
---

# Monetize the language-learning app

Two parts: what to sell (`references/subscription-app-revenue.md`, vendored playbook) and how to take and verify money safely (`references/thai-qr-kbank.md`). Read both before proposing a plan.

## Non-negotiables

1. **The server decides who has paid.** The client never sets premium status, never trusts a "paid" button, a webhook body, an uploaded slip image or a QR it generated itself. Payment is confirmed only by the bank (KBank K API inquiry/callback with verified signature, or a slip-verification API) on a server, then written to the entitlement by the server.
2. **Secrets never reach the browser.** Anything prefixed `VITE_` is bundled into the public JS. Bank client secrets, slip-API keys and service-account keys live only in server env (Cloudflare Pages Functions secrets or Firebase Functions secrets). Never commit them; `.env.example` holds names only.
3. **Learner data stays free.** Progress, reviews, backup/export (`src/services/backup`) and the core N5 deck stay available to everyone. Paywalls lock extra value, never the user's own data.
4. **Google Play rule.** In the Play-distributed Android app, digital content and subscriptions must use Google Play Billing (alternative/external billing is not yet open in Thailand; Google says other regions follow by 30 Sep 2027 — re-check before launch). KBank QR is for the web/PWA. The Android build hides QR checkout; both channels grant the same entitlement by Firebase `uid`.
5. **Local-first still works offline.** Cache the entitlement with its expiry on device; allow a short grace period offline; re-check online.

## Architecture to propose (fits the existing L2/L3 Firebase account code)

```
Client (PWA)                Server (Pages Function or Cloud Function)        Bank / Store
 choose plan  ──POST /orders──▶ create order {uid, plan, amount, expiresAt}
              ◀── QR payload / K API QR ──┤                                   KBank K API: create QR
 show QR, poll order status                │◀── callback (verify signature) ── KBank
                                            ├── or inquiry by partnerTxnUid ─▶ KBank
 (fallback) upload slip ──POST /verify-slip─▶ slip API: transRef, amount,      Slip verification API
                                            │   receiver, date; dedupe transRef
                                            └─ write entitlements/{uid} (Admin SDK only)
 read entitlements/{uid} (owner read-only) ◀┘
```

- Firestore: `orders/{orderId}` and `entitlements/{uid}`; add rules so the owner can **read** only and no client can write (update `firestore.rules`, test in `tests/rules`, run `npm run test:emulators`).
- Entitlement shape: `{ plan, source: 'kbank_qr'|'slip'|'play', grantedAt, expiresAt|null, orderId|purchaseToken }`. Lifetime unlocks use `expiresAt: null`.
- Feature gating lives in one place (e.g. `src/features/account/entitlement.ts` + a hook) and respects layer rules (`tests/unit/architecture.test.ts`): UI asks "is feature X unlocked?", never reads Firestore directly.

## Workflow

1. **Plan** (output contract in `references/subscription-app-revenue.md`): diagnosis, what is free/premium, prices in THB (e.g. monthly + annual + lifetime), paywall placement (after a completed review session, not on first launch), metrics.
2. **Confirm with the owner** before code: plan, provider (KBank K API merchant account vs PromptPay + slip API), hosting for server code, legal texts.
3. **Build in gated steps**: rules + tests → server order/verify endpoints with a mock bank → client paywall + entitlement hook → real sandbox → production keys set by the owner.
4. **Test**: unit tests (QR payload + CRC, amount/receiver checks, dedupe, expiry), rules tests (client cannot write entitlements/orders), emulator E2E of the full flow, replayed slip rejected, wrong amount rejected, expired order rejected, callback with bad signature rejected.
5. **Legal/ops**: PDPA notice update in `PrivacyPage`, terms + refund policy, receipt/e-tax invoice if registered for VAT, support contact, how to grant/revoke manually.

## Guardrails

- No dark patterns: clear price, renewal and cancel terms; no fake scarcity.
- Do not store full bank account numbers or slip images longer than needed; log the transaction reference, amount, time.
- Do not invent K API endpoints or field names: use the official KBank developer portal spec the owner gets after merchant onboarding.
