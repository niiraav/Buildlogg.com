# Sprint: BU-6 + CU-4 — Progress Log

> **Branch:** codex/bu6-cu4
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build + lint green

---

## Items

| # | Feature | File | Status | Commit |
|---|---------|------|--------|--------|
| BU-6 | Booking accept flow with deposit link | `src/lib/booking.ts`, `src/lib/db.ts` | ✅ Done | (this commit) |
| CU-4 | Card payment upsell nudge at chase moment | `src/screens/Home/index.tsx` | ✅ Done | (this commit) |

---

## BU-6 — Booking Accept Flow with Deposit Link

**What changed:**
- Added import: `createCheckoutSession` from `./stripe` in booking.ts
- Added `deposit_pct?: number` to the `Profile` interface in db.ts (the column already exists in Supabase's profiles table — the booking Function queries it at line 172 — but the TypeScript type didn't declare it)
- In `acceptBookingRequest`, after the line item block and before the booking request update:
  - Declared `let depositLinkSuffix = ''` to store the deposit link text
  - Condition: `profile.payment_terms === 'deposit' && profile.stripe_connected && booking.status !== 'deposit_paid' && booking.service_amount > 0`
  - Calculates `depositAmount = booking.service_amount * (depositPct / 100)` where `depositPct = profile.deposit_pct || 20`
  - Guards: `depositAmount >= 0.50` (Stripe minimum charge)
  - Calls `createCheckoutSession({ merchantId, jobId, amount, description, type: 'deposit' })`
  - Updates the job in Dexie with `deposit_status: 'requested'`, `deposit_stripe_url`, `deposit_stripe_link_id`, `deposit_requested_at`
  - Queues sync with `operation: 'update'`
  - Sets `depositLinkSuffix` to the deposit payment URL text
  - Wrapped in try/catch — on failure, `depositLinkSuffix` stays empty
- In the return statement: `confirmationMessage: confirmationMessage + depositLinkSuffix` — appends the deposit link to the confirmation message without changing `const` to `let`

**Edge cases handled:**
- `booking.status === 'deposit_paid'` → deposit block skipped (already paid via BU-5)
- `!profile.stripe_connected` → deposit block skipped
- `payment_terms !== 'deposit'` → deposit block skipped
- `booking.service_amount === 0` → deposit block skipped
- `depositAmount < 0.50` → Stripe minimum guard skips
- `createCheckoutSession` throws → caught, confirmation sends without link, job still created and accepted
- `profile.deposit_pct` undefined → defaults to 20 (matches pdfGenerator.ts pattern)

---

## CU-4 — Card Payment Upsell Nudge at Chase Moment

**What changed:**
- Added `cardNudgeDismissed` state with lazy init from localStorage: `useState(() => localStorage.getItem('buildlogg_tip_dismissed_card_payments') === '1')` — same pattern as `sampleExplored`
- In the chase task card sheet, inside the `!isPaused` fragment, after the `{profile?.stripe_connected && (<Button>Send card payment link</Button>)}` block:
  - Added a dismissible nudge div with condition `!profile?.stripe_connected && !cardNudgeDismissed`
  - Contains: `CreditCard` icon + "Tired of chasing? Let customers pay online." + "Enable card payments →" link (`navigate('/settings')`)
  - Dismiss X button: sets localStorage + `setCardNudgeDismissed(true)` for immediate re-render
  - Styling: `bg-brand-surface border border-brand-border rounded-lg p-3` — matches existing info box pattern

**Edge cases handled:**
- `stripe_connected === true` → nudge not shown (the "Send card payment link" button shows instead)
- Nudge dismissed → `setCardNudgeDismissed(true)` triggers re-render → nudge disappears immediately
- Dismissal persists permanently via localStorage — no TTL
- `stripe_connected` undefined → treated as falsy → nudge shows

---

## Build Verification

```
$ npx tsc --noEmit
(zero errors)

$ npx vite build
✓ built in 93ms
PWA v0.20.5 — 99 precache entries

$ npm run lint
(zero errors)
```

---

## Files Changed

| File | Lines | What |
|------|-------|------|
| `src/lib/db.ts` | +1 | Added `deposit_pct?: number` to Profile interface |
| `src/lib/booking.ts` | +41 | Import + deposit link generation block + return append |
| `src/screens/Home/index.tsx` | +19 | cardNudgeDismissed state + nudge UI |

---

*Last updated: 2026-06-28*
*Author: Codex*
