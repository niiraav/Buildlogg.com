# Date/Time Native Picker Fix — Progress

> Commit: 99a9103

## Issue

Native date/time picker popover doesn't appear when tapping date or time inputs inside the "Edit job details" BottomSheet or the Booking settings screen.

## Root Cause

CSS rules in `globals.css` set `display: none` on `::-webkit-inner-spin-button` and `::-webkit-clear-button` pseudo-elements for `input[type="date"]` and `input[type="time"]`. These pseudo-elements are part of the native picker trigger mechanism — hiding them prevents the picker from appearing on Chrome desktop and iOS Safari.

## Fix

Removed both `display: none` CSS rules. Kept the `text-align: left` rule on `::-webkit-date-and-time-value` (only affects text alignment, not the picker).

## Why This Won't Squash Inputs

The previous "squashing" issue was on a read-only display `<span>`, not the `<input>` fields. The inputs have:
- Fixed height: `h-12` (48px)
- Full width: `w-full`
- Right padding: `pr-10` (40px) — reserves space for native buttons (~30px)

## Verification

| Check | Status |
|-------|--------|
| `tsc --noEmit` | ✅ Exit 0 |
| `vite build` | ✅ Exit 0 |
| CSS rules removed | ✅ Verified — only `text-align: left` remains |
| No other files changed | ✅ Only `globals.css` |

*Last updated: 2026-06-29*
