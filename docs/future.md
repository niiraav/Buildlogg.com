# Future Work — Queued Items

## 1. BottomSheet sticky footer prop
**Problem:** CTA buttons (Send via WhatsApp, Send via SMS, Copy, Save draft) are hidden below the fold inside the scrollable content area. Users can't see them without scrolling.

**Fix:** Add optional `footer` prop to `BottomSheet` component. Footer renders outside the scrollable div, pinned to the bottom of the sheet. Move CTAs from SendSheet (and any sheet with action buttons) into `footer`. Short action-menu sheets (SheetRows only) don't need to change.

**Files:**
- `src/components/BottomSheet/index.tsx` — add `footer` prop, render below scrollable content div
- `src/components/SendSheet/index.tsx` — move send buttons into `footer`
- `src/screens/JobDetail/index.tsx` — move CTA buttons from log expense, add charge, add note, edit details, finish previous sheets into `footer`
- `src/components/FeedbackSheet/index.tsx` — move submit button into `footer`

**Pattern:**
```
┌─────────────────────────┐
│ Drag handle             │
│ Title + X               │
│ Subtitle                │
├─────────────────────────┤
│ ← scrollable content →  │
│   message preview       │
│   toggles               │
├─────────────────────────┤
│ ← sticky footer →       │
│   Send via WhatsApp     │
│   Send via SMS          │
└─────────────────────────┘
```

## 2. Settings trade selector — visual feedback + horizontal chips
**Problem:** No visual indication of which trade is selected. Vertical SheetRow list is fidgety and doesn't scale past 4-5 options.

**Fix:**
- Replace vertical SheetRow list with horizontal chip/pill selector
- Selected trade gets filled background + checkmark
- "Other" chip reveals text input inline
- Remove duplicate standalone Trade BottomSheet (line 850) — consolidate into profile sheet only
- Add `footer` prop to profile sheet for Save button (depends on #1)

**Files:**
- `src/screens/Settings/index.tsx` — replace trade SheetRows with chips, remove duplicate trade sheet
- `src/components/BottomSheet/index.tsx` — add `selected` support to SheetRow (optional, if keeping SheetRow for other uses)

## 3. Quote builder refresh data loss — customer details step
**Problem:** If page refreshes while on the customer details step of the quote flow, all entered data (name, phone, address, email) is lost. The form uses local React state with no persistence.

**Fix:** Persist customer form fields to `localStorage` alongside the existing quote state (`buildlogg_quote_state`). On mount, restore the form fields if present and still valid.

**Files:**
- `src/screens/Quote/CustomerDetails.tsx` — save form fields to localStorage on change, restore on mount
- `src/screens/Quote/index.tsx` — extend `buildlogg_quote_state` to include customer form fields

**Key details:**
- `CustomerDetails` lines 59-62: local state only, no persistence
- `Quote/index.tsx` lines 79-86: saves `{ step, customerId, jobId, sendMethod }` but NOT form fields
- On refresh, `location.state` is null (React Router doesn't persist it), so `initialCustomerId` is lost
- The builder step DOES persist correctly (job saved to Dexie via `saveJob()` on blur)

## Priority
1. BottomSheet sticky footer (#1) — affects all sheets with CTAs, highest UX impact
2. Trade selector (#2) — depends on #1 for Save button footer
3. Quote refresh (#3) — standalone, can be done independently
