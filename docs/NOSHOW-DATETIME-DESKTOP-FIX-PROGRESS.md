# No-show Detail + Date/Time Picker + Desktop Context Fix — Progress Log

> **Commit:** (this commit)
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build + lint green

---

## Items

| # | Fix | File | Status | Commit |
|---|-----|------|--------|--------|
| 1 | No-show job detail: expanded body with location, schedule, quote items | `src/screens/JobDetail/index.tsx` | ✅ Done | (this commit) |
| 2a | Date/time picker: removed CSS hiding native picker indicator | `src/styles/globals.css` | ✅ Done | (this commit) |
| 2b | Date/time picker: removed appearance-none + decorative icons from JobDetail | `src/screens/JobDetail/index.tsx` | ✅ Done | (this commit) |
| 2c | Date/time picker: removed appearance-none + decorative icons from QuoteBuilder | `src/screens/Quote/QuoteBuilder.tsx` | ✅ Done | (this commit) |
| 3 | Desktop context: filter sample jobs from active count | `src/components/AppDesktopContext/index.tsx` | ✅ Done | (this commit) |

---

## Fix 1 — No-show job detail body

**What changed:**
- Replaced the minimal `renderNoShowBody()` (just "What happened" box) with an expanded version showing:
  1. "What happened" box (existing — kept at top)
  2. Location card (with MapPreview + Navigate button, or "No address set" with Add button)
  3. Schedule card (simplified: date + arrival window only, no deposit/payment terms)
  4. Quote items (InvoiceItemRow list + InvoiceTotalRow)
- Footer unchanged (Reschedule / Charge callout buttons)

## Fix 2 — Date/time picker

**What changed:**
- `globals.css`: removed `::-webkit-calendar-picker-indicator { opacity: 0 }` (was hiding native picker icon) and `input[type="date"], input[type="time"] { appearance: none }` (was stripping native appearance)
- Kept: `text-align: left`, `display: none` on inner-spin-button and clear-button
- `JobDetail/index.tsx`: removed `appearance-none` from 3 inputs, removed decorative `Calendar`/`Clock` icon overlays, removed `Calendar` from imports (unused after icon removal)
- `QuoteBuilder.tsx`: removed `appearance-none` from 3 inputs, removed decorative `Calendar`/`Clock` icon overlays, removed both from imports
- Settings/Booking: no changes needed (no appearance-none or icon overlays — fixed by global CSS change)

## Fix 3 — Desktop context sample job filter

**What changed:**
- Added `!j.is_sample` to 3 filter conditions in AppDesktopContext: inProgress, booked, and awaiting_payment
- Sample jobs no longer inflate the "Active jobs" count in the left desktop panel

---

## Build Verification

```
$ npx tsc --noEmit
(zero errors)

$ npx vite build
✓ built in 391ms
PWA v0.20.5 — 99 precache entries

$ npm run lint
(zero errors)
```

---

*Last updated: 2026-06-28*
*Author: Codex*
