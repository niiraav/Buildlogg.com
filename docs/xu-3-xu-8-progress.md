# XU-3 + XU-8: Recurring Revenue Stat + Full Scheduling Conflicts — Progress

> Commit: a25a670

## Implementation items

| # | Item | Status | Commit | Verification |
|---|------|--------|--------|-------------|
| XU-3 | Recurring revenue stat on Dashboard | ✅ Done | a25a670 | `tsc --noEmit` exit 0, `vite build` exit 0. Card renders between profit and top job type when recurringRevenue.total > 0. Queries `db.recurring_jobs` active + `db.line_items` filtered `!is_sample`. |
| XU-8 | Full scheduling conflicts in booking accept | ✅ Done | a25a670 | `tsc --noEmit` exit 0. `checkBookingConflictsFull()` wraps `checkBookingConflict` (Supabase fallback preserved) + `detectConflicts` (back-to-back, travel time). Home sheet shows red/amber/green badges. |

## Verification

| Check | Status | Notes |
|-------|--------|-------|
| Baseline `tsc --noEmit` | ✅ Exit 0 | Before changes |
| Baseline `vite build` | ✅ Exit 0 | Before changes |
| Post-change `tsc --noEmit` | ✅ Exit 0 | After all changes |
| Post-change `vite build` | ✅ Exit 0 | PWA SW built, 99 entries precached |

## Files changed

| File | Changes |
|------|---------|
| `src/screens/Dashboard/index.tsx` | +`db` import, +`Calendar` icon, +`recurringRevenue` state + useEffect (queries active recurring_jobs + line_items excluding is_sample), +stat card between profit and top job type |
| `src/lib/booking.ts` | +`detectConflicts`/`SchedulingConflict` import from scheduling.ts, +`checkBookingConflictsFull()` function (wraps checkBookingConflict for overlap + detectConflicts for soft warnings) |
| `src/screens/Home/index.tsx` | +`checkBookingConflictsFull` import, +`SchedulingConflict` import, changed `bookingConflict` state to `{ overlap, soft }`, updated useEffect to call `checkBookingConflictsFull`, updated sheet display with 3-state badge (red/amber/green) |

*Last updated: 2026-06-29*
