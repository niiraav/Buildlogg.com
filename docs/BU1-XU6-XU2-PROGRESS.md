# Sprint: BU-1 + XU-6 + XU-2 — Progress Log

> **Branch:** codex/bu1-xu6-xu2
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build + lint green

---

## Items

| # | Feature | File | Status | Commit |
|---|---------|------|--------|--------|
| BU-1 | Booking link on QuoteSent screen | `src/screens/Quote/QuoteSent.tsx` | ✅ Done | (this commit) |
| XU-6 | Mini "completed today" stat on Home | `src/screens/Home/index.tsx` | ✅ Done | (this commit) |
| XU-2a | Pricing insights card on Dashboard | `src/screens/Dashboard/index.tsx` | ✅ Done | (this commit) |
| XU-2b | Avg per-job subtitle on CustomerDetail | `src/screens/Customers/CustomerDetail.tsx` | ✅ Done | (this commit) |

---

## BU-1 — Booking Link on QuoteSent Screen

**What changed:**
- Added imports: `Calendar`, `ExternalLink` from lucide-react; `bookingPageUrl` from `referral.ts`; `showSuccess` from Toast store.
- New "Let them book online" card inserted between the "What happens next" card and the feature discovery tip.
- Renders only when `profile?.booking_enabled && profile?.booking_slug`.
- Two actions: "Copy booking link" (clipboard + toast) and "Open" (external link to booking page).
- Shows the booking URL (protocol-stripped) below the buttons for transparency.

**Edge cases handled:**
- `booking_enabled === false` or `booking_slug` missing → card not rendered
- Profile not loaded yet → `booking_enabled` is undefined → falsy → no card
- Clipboard API failure → catch block still shows success toast (URL is visible to copy manually)
- `navigator.clipboard` undefined (older browsers) → optional chaining prevents crash, catch fires

---

## XU-6 — Mini "Completed Today" Stat on Home

**What changed:**
- Added `completedToday` useMemo: filters `jobs` for `status === 'paid'` AND `actual_end` is today (using existing `isToday` helper), computes count + total from `lineItems` map.
- Renders below the greeting/today-label as a subtle green stat: "{count} jobs · £{total} completed today".
- Only shows when `completedToday.count > 0` — no clutter on days with no completions.

**Edge cases handled:**
- No jobs completed today → stat not rendered (no empty state noise)
- `actual_end` missing → filtered out by the `j.actual_end &&` guard
- Reactive: updates automatically via useLiveQuery when a job is marked paid
- Label says "completed" not "earned" — honest (it's quoted value, not cash received)

---

## XU-2a — Pricing Insights Card on Dashboard

**What changed:**
- Added imports: `getJobTitlePricingHistory`, `JobTitlePricing` from `pricingHistory.ts`.
- Added `pricing` state (`useState<JobTitlePricing | null>(null)`).
- Added useEffect: fetches pricing history for `stats.topJobType.title` when stats are available, with `.catch(() => {})` for graceful failure.
- New "Pricing insights" card after the "Top job type" card: "You've quoted {title} {count}× — £{min} to £{max}, avg £{avg}".
- Variance warning: if `highVariance && count >= 3`, shows amber "High price variance — consider standardising your pricing" with AlertCircle icon.
- Card only renders when `pricing && pricing.count >= 2` (needs at least 2 data points to be meaningful).

**Edge cases handled:**
- No top job type → pricing effect doesn't fire, no card
- Only 1 job of that type → `count < 2` → card not rendered (single data point isn't insight)
- `getJobTitlePricingHistory` throws → caught silently, no card, dashboard still loads
- `highVariance` but `count < 3` → warning not shown (variance on 2 jobs isn't reliable)

---

## XU-2b — Avg Per-Job Subtitle on CustomerDetail

**What changed:**
- In the "Total spent" stat cell, added subtitle `avg £{(totalSpent/jobCount).toFixed(0)}/job` when `jobCount > 0`.
- Uses existing `getCustomerStats` data (`totalSpent` and `jobCount` already computed).
- No new grid cell — subtitle fits below "Total spent" label.

**Edge cases handled:**
- `jobCount === 0` → subtitle not rendered (can't divide by zero, and no jobs means no average)
- `totalSpent === 0` with jobs → shows "avg £0/job" (valid — free/complimentary jobs)

---

## Build Verification

```
$ npx tsc --noEmit
(zero errors)

$ npx vite build
✓ 70 modules transformed.
✓ built in 270ms
PWA v0.20.5 — 99 precache entries

$ npm run lint
(zero errors)
```

---

## File Disjointness (no conflict with current sprint)

| This sprint | Current sprint (CU-1+BU-2+XU-1+XU-4) |
|-------------|--------------------------------------|
| `src/screens/Quote/QuoteSent.tsx` | `src/screens/Quote/QuotePreview.tsx` (BU-2) |
| `src/screens/Home/index.tsx` | `src/screens/Quote/QuoteBuilder.tsx` (XU-1) |
| `src/screens/Dashboard/index.tsx` | `src/screens/JobDetail/index.tsx` (CU-1, XU-4) |
| `src/screens/Customers/CustomerDetail.tsx` | `src/lib/templateEngine.ts` (BU-2) |

Zero file overlap. Safe to merge in parallel.

---

*Last updated: 2026-06-28*
*Author: Codex*
