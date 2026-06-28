# Sprint: BU-5 + XU-7 — Progress Log

> **Commit:** 0577849
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build green

---

## Items

| # | Feature | File(s) | Status | Commit |
|---|---------|---------|--------|--------|
| BU-5 | Deposits on booking page | `functions/book/[[slug]].js`, `functions/api/stripe-webhook.js`, `src/lib/db.ts`, `src/lib/booking.ts` | ✅ Done | 0577849 |
| XU-7 | Templates in booking + chase | `src/lib/booking.ts`, `src/screens/Home/index.tsx` | ✅ Done | 0577849 |

---

## BU-5 — Deposits on Booking Page

**What changed:**
- Booking Function POST handler: after inserting booking_requests, if merchant has `payment_terms='deposit'` + `stripe_connected` + `deposit_pct > 0` + `serviceAmount > 0`, creates a Stripe Checkout Session inline and returns `{success:true, redirectUrl}`.
- Client-side `submitBooking`: checks `res.redirectUrl` and redirects to Stripe Checkout before showing success page.
- Stripe webhook: new `!jobId && checkoutRecord.booking_request_id` block marks `booking_requests.status = 'deposit_paid'`.
- `BookingStatus` type: added `'deposit_paid'` union member.
- `getPendingBookingRequests`: filter includes `deposit_paid` alongside `pending`.
- `acceptBookingRequest`: guard allows `deposit_paid` status; sets `newJob.deposit_status = 'paid'` and `deposit_amount` when booking had a deposit.

**Edge cases handled:**
- `payment_terms !== 'deposit'` or `stripe_connected === false` → no deposit, normal flow
- `serviceAmount === 0` → no deposit (can't charge percentage of nothing)
- `depositAmount < £0.50` → skip (Stripe minimum)
- Stripe session creation fails → booking still created, no redirect, success page shown
- Client abandons checkout → booking request exists as `pending`, no payment
- Webhook with booking_request_id but no job → marks `deposit_paid`, merchant accepts later

---

## XU-7 — Templates in Booking Confirmation + Chase

**What changed:**
- `booking.ts`: imported `getFilledTemplateMessage`, replaced hardcoded `confirmationMessage` with `getFilledTemplateMessage(userId, 'booking', newJob, templateCustomer, profile, amount, fallback)`. Fallback is the existing hardcoded string.
- `Home/index.tsx`: imported `getFilledTemplateMessage`, in chase "Send chase" onClick, replaced direct `stageMessages[stage]` usage with `await getFilledTemplateMessage(userId, 'invoice', job, customer, profile, total, fallbackMsg)`. The `fallbackMsg` is the stage-specific hardcoded message (gentle/firm/final), preserving the escalation ladder when no custom template exists.

**Edge cases handled:**
- No template saved → `getFilledTemplateMessage` returns the fallback (identical to previous behavior)
- Chase escalation ladder preserved → stage-specific fallbacks (gentle/firm/final) used when no custom template
- Custom template exists → replaces all stages (user chose to customize)
- CU-2 Stripe link append still works on top of filled template

---

## Build Verification

```
$ npx tsc --noEmit
(zero errors)

$ npx vite build
✓ built in 741ms
PWA v0.20.5 — 99 precache entries
```

---

*Last updated: 2026-06-28*
*Author: Codex*
