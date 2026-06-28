# Utilization Fixes — Push Warning + Booking Conflict Gate + Calendar on In-Progress + General Expenses

> **Commit:** (this commit)
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build + lint green

---

## Items

| # | Fix | Files | Status | Commit |
|---|-----|-------|--------|--------|
| 1 | Push "not fully active" warning | `src/screens/Settings/Reminders.tsx` | ✅ Done | (this commit) |
| 2 | Booking accept conflict gate (two-tap) | `src/screens/Home/index.tsx` | ✅ Done | (this commit) |
| 3 | Calendar on in-progress jobs | `src/screens/JobDetail/index.tsx` | ✅ Done | (this commit) |
| 4 | General (non-job) expense logging | `src/lib/db.ts`, `src/lib/dashboard.ts`, `src/lib/activityFilter.ts`, `src/screens/Dashboard/index.tsx` | ✅ Done | (this commit) |

---

## Fix 1 — Push Warning
- Amber banner on Reminders screen when push is enabled: "Push is subscribed, but automated sending isn't active yet."
- Prevents the broken promise of silent push delivery when no server-side send Function exists.

## Fix 2 — Booking Conflict Gate
- When `bookingConflict.overlap` exists, first tap on Accept changes button to "Accept anyway", second tap proceeds.
- `acceptConfirmed` state resets on sheet open, close, and after successful accept.
- Soft conflicts (travel time, back-to-back) do NOT trigger the gate.

## Fix 3 — Calendar on In-Progress
- "Add to calendar" button added to `renderInProgressBody` — same as `renderBookedBody`.
- Condition: `job.scheduled_start` must be set.

## Fix 4 — General Expenses
- `WorkLogEntry.job_id` changed from `string` to `string | null` — allows general expenses.
- `dashboard.ts` queries general expenses via `created_at` index + filter for `type === 'expense' && !job_id`.
- Dashboard profit card has "+ Log expense" button → BottomSheet with description + amount → logs with `job_id: null`.
- `activityFilter.ts` + `Home/index.tsx` updated to handle null `job_id` in work log maps.

---

## Build Verification

```
$ npx tsc --noEmit — zero errors
$ npx vite build — ✓ built, 99 precache entries
$ npm run lint — zero errors
```

---

*Last updated: 2026-06-28*
*Author: Codex*
