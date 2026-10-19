# Thai QR / PromptPay via KBANK, and verifying real payments

Status: written October 2026 from public sources. Bank API details change and need a merchant agreement; always confirm against the official KBank developer portal (K API) before coding field names.

## Option A — KBank K API "QR Payment" (recommended for automation)

- Requires a KBank merchant/corporate account and K API onboarding; you receive a client ID/secret for OAuth2 (client credentials) and a sandbox.
- Flow: server requests a dynamic Thai QR for an amount and your own unique reference (one per order) → show the QR → KBank notifies your callback when paid and/or you call the inquiry endpoint with your reference → mark the order paid **only** after a successful inquiry/verified callback whose amount and reference match the order.
- Treat callbacks as hints: verify the signature/mTLS the spec requires, then re-inquire by reference before granting.
- Idempotent handler: the same reference can arrive more than once.
- Customers pay with any Thai banking app (Thai QR / PromptPay standard), not only K PLUS.

## Option B — PromptPay QR + slip verification (no merchant API)

1. Server generates an EMVCo Thai QR payload for the shop's PromptPay ID (mobile/tax ID/e-wallet) with a fixed amount:
   - Tag `00` format `01`, `01` = `12` (dynamic, with amount), merchant account tag `29` with AID `A000000677010111` + PromptPay ID (phone as `0066` + number without leading 0, 13 digits), `53` = `764` (THB), `54` = amount, `58` = `TH`, `63` = CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the whole string including `6304`.
   - Unit-test the payload against a known-good QR from a bank app.
2. User pays and uploads the slip (or the mini-QR text on it).
3. Server reads the slip mini-QR (contains the sending bank code + transaction reference) and calls a slip-verification API (bank API under agreement, or a Thai provider such as SlipOK / EasySlip / RDCW Slip Verify, chosen by the owner). Never decide from OCR of the image alone.
4. Accept only if all hold: receiver account/PromptPay matches the shop; amount equals the order amount; transaction time is after the order was created and before it expired; the transaction reference has **never been used before** (store used refs with a unique key); the order belongs to this `uid`.
5. Then write the entitlement. Keep a manual review queue for mismatches.

Weaknesses of B: manual step for the user, provider cost per check, fraud attempts with edited or reused slips (prevented by checks above, not by looking at the image).

## Amount and order hygiene

- One order = one amount = one reference; expire unpaid orders (e.g. 15 minutes for a dynamic QR).
- Store money as integer satang.
- Log: orderId, uid, amount, reference, bank time, verifier response id. Not full account numbers.

## Google Play

The Android app in Play must use Play Billing for digital unlocks. Verify purchases server-side with the Google Play Developer API (`purchases.subscriptionsv2.get` / `purchases.products.get`), handle RTDN (Pub/Sub) for renewals/cancels/refunds, acknowledge within 3 days, and map the purchase token to the same `entitlements/{uid}`.

## Sources (check for updates)

- KBank QR Payment via K API (overview): https://flowaccount.com/en/help-center/category/kbank/what-is-qr-kbank
- Slip mini-QR verification concept: https://thai-qr-payment.js.org/guide/slip-verify/
- K PLUS verified slip (consumer feature): https://www.kasikornbank.com/en/personal/digital-banking/kplus/functions/verified-slip/Pages/index.html
- Google Play payments policy: https://play.google.com/about/monetization-ads/payments
