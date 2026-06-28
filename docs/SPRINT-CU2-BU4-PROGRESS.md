# Sprint: CU-2 + BU-4 — Progress Log

> **Commit:** c83f5de
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build green

---

## Items

| # | Feature | File | Status | Commit |
|---|---------|------|--------|--------|
| CU-2 | Stripe link in chase messages | `src/screens/Home/index.tsx` | ✅ Done | c83f5de |
| BU-4 | Rebook link post-payment | `src/screens/JobDetail/index.tsx` | ✅ Done | c83f5de |

---

## CU-2 — Stripe Payment Link in Chase Messages

**What changed:**
- New import: `createCheckoutSession` from `../../lib/stripe`
- New state: `chaseStripeLoading` — loading indicator for async Stripe calls
- "Send chase" button onClick is now async: if `stripe_connected`, generates a Stripe checkout session and appends `Pay online here: [url]` to the message. Shows "Preparing chase..." while loading. On failure, falls through to plain text.
- Work log description uses `[+ card payment link]` suffix instead of the full Stripe URL for readability.
- New "Send card payment link" button (secondary, CreditCard icon): sends a payment-only message with just the Stripe URL. Only shows when `stripe_connected && !isPaused && !isSmallClaims`.
- Both buttons wrapped in a `<>` fragment inside the `!isPaused` ternary branch.

**Edge cases handled:**
- `stripe_connected === false` → no card payment button, Send chase is synchronous plain text
- `createCheckoutSession` fails → graceful fallthrough to plain text, no error toast on Send chase
- Small claims stage → neither button shows, small claims info card shown instead
- Paused chase → neither button shows, Resume chase button shown instead
- Loading state prevents double-tap

---

## BU-4 — Rebook Link Post-Payment

**What changed:**
- New import: `bookingPageUrl` from `../../lib/referral`
- New "Book again" card in `renderPaidBody()`: inserted between payment record card and photos/materials section
- Card shows when `profile?.booking_enabled && profile?.booking_slug`
- Two buttons: "Send booking link" (opens SendSheet with pre-filled booking URL message, disabled for sample jobs) and "Copy booking link" (clipboard copy with toast)
- Uses `CalendarPlus` icon (already imported) for the card title

**Edge cases handled:**
- `booking_enabled === false` or `booking_slug` missing → card not rendered
- Sample job → "Send booking link" button disabled
- Customer has no phone → SendSheet opens but WhatsApp/SMS disabled, copy still works
- Offline → clipboard copy works, SendSheet send requires network

---

## Build Verification

```
$ npx tsc --noEmit
(zero errors)

$ npx vite build
✓ built in 81ms
PWA v0.20.5 — 99 precache entries
```

---

*Last updated: 2026-06-28*
*Author: Codex*
