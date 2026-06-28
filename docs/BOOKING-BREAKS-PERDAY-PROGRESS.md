# Booking Page Lunch Breaks + Per-Day Hours — Progress

## Summary
Add lunch break support and per-day working hours to the booking page. Sophie (beauty) can set a 12-1pm break so clients can't book during lunch. Per-day hours let her set Saturday 10am-2pm instead of global hours.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | Profile schema: booking_break_start, booking_break_end, booking_hours_per_day | ✅ Done | e287f07 |
| 2 | Supabase migration: 20260628000004_booking_breaks_perday.sql | ✅ Done | e287f07 |
| 3 | Booking Function: computeAvailableSlots with break skip + per-day hours + POST validation | ✅ Done | e287f07 |
| 4 | Settings Booking UI: break time inputs + per-day hours editor with reset | ✅ Done | e287f07 |
| 5 | Build passes | ✅ Done | e287f07 |

## Files Changed
- src/lib/db.ts — 3 new Profile fields
- supabase/migrations/20260628000004_booking_breaks_perday.sql (NEW) — migration
- functions/book/[[slug]].js — computeAvailableSlots break/per-day logic + POST validation
- src/screens/Settings/Booking.tsx — break time inputs + per-day hours editor

## Manual Setup Required
1. Run migration in Supabase SQL Editor: 20260628000004_booking_breaks_perday.sql
