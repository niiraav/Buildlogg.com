# Sprint: CU-1 + BU-2 + XU-1 — Progress Log

> **Commit:** cf4c652
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build green

---

## Items

| # | Feature | File | Status | Commit |
|---|---------|------|--------|--------|
| CU-1 | Card payment link in completion sheet | `src/screens/JobDetail/index.tsx` | ✅ Done | cf4c652 |
| BU-2 | Booking link in quote message | `src/screens/Quote/QuotePreview.tsx` | ✅ Done | cf4c652 |
| XU-1 | Trade templates in QuoteBuilder | `src/screens/Quote/QuoteBuilder.tsx` | ✅ Done | cf4c652 |
| XU-4 | Customer notes banner on JobDetail | `src/screens/JobDetail/index.tsx` | ✅ Already built | N/A |

---

## CU-1 — Card Payment Link in Completion Sheet

**What changed:**
- New `handleMarkDoneCardPayment` handler: completes the job (sets `awaiting_payment`, `actual_end`, `invoice_sent_at`, creates work log, ensures invoice number, creates payment chases) then delegates to `handleRequestStripePayment('full')` which creates the Stripe checkout session and opens the SendSheet.
- Added `SheetRow` to `renderMarkDoneSheet` (payment step, after "Bank Transfer", before "Other"): shows "Send card payment link (£X)" with CreditCard icon. Only renders when `profile?.stripe_connected && summary.amountDue > 0`.
- Added `SheetRow` to `renderMarkPaidSheet` (after "Bank Transfer", before "Other"): same condition, calls `handleRequestStripePayment('full')` directly (job is already `awaiting_payment`).
- Error handling: wrapper catches DB write failures, shows error toast, returns early without calling Stripe.

**Edge cases handled:**
- `stripe_connected === false` → row not rendered
- `amountDue === 0` → row not rendered
- DB write failure → error toast, job stays `in_progress`, no Stripe session
- Stripe API failure → existing try/catch in `handleRequestStripePayment` handles it
- `stripeLoading` race → SheetRow `disabled` when `paymentProcessing || stripeLoading`

---

## BU-2 — Booking Link in Quote Message

**What changed:**
- Added `import { bookingPageUrl } from '../../lib/referral'` to QuotePreview.
- In `defaultMessage` useMemo: after `businessName`, if `profile?.booking_enabled && profile?.booking_slug`, appends `Book online: buildlogg.com/book/{slug}` (protocol stripped for SMS brevity).
- In `compactMessage` useMemo: same condition and append.
- Updated both useMemo dependency arrays to include `profile?.booking_enabled, profile?.booking_slug`.

**Edge cases handled:**
- `booking_enabled === false` or `booking_slug` missing → no link appended
- User edits message → `editingMessage` flag preserves user's version
- Profile not loaded yet → `booking_enabled` is undefined → falsy → no link, recomputes when profile arrives

---

## XU-1 — Trade Templates in QuoteBuilder

**What changed:**
- Added imports: `BottomSheet, SheetRow` from BottomSheet, `TRADE_TEMPLATES, BEAUTY_TEMPLATES, type TemplateSeed` from tradeTemplates, `LayoutTemplate` from lucide-react.
- New state: `showTemplateSheet`.
- New function `applyTemplate(seeds)`: maps seeds to `EditableItem[]`, replaces `items` state, writes directly to Dexie (delete old line_items, add new ones with sync_queue entries). Bypasses `saveItems` useCallback to avoid stale state race condition.
- New function `getAvailableTemplates()`: returns beauty templates if `business_type === 'beauty'`, otherwise trade-specific templates based on `profile.trade` (defaults to 'other').
- "Start from template" button: dashed-border pill, shown only when `items.length === 0` or single empty item. Opens the template picker BottomSheet.
- BottomSheet: one SheetRow per available template group, tapping applies the template.

**Edge cases handled:**
- `profile.trade` undefined → shows `TRADE_TEMPLATES['other']` (3 items)
- `profile.business_type` undefined → defaults to trades behavior
- `profile.business_type === 'beauty'` → shows BEAUTY_TEMPLATES only
- Items already exist → button not shown (prevents accidental overwrite)
- `currentJobId` not set → items updated in state, saved on next blur/preview

---

## Build Verification

```
$ npx tsc --noEmit
(zero errors)

$ npx vite build
✓ built in 714ms
PWA v0.20.5 — 99 precache entries
```

---

*Last updated: 2026-06-28*
*Author: Codex*
