# Bug Fix: initialSync console logs firing on every click

## Repro
Console shows `[initialSync]` logs (e.g. "synced 82 rows") appearing frequently when using the app, perceived as firing on every click.

## Root cause
Two issues:
1. `window` `focus` event fires on every click within desktop browser pages (fixed in prior commit: replaced with `visibilitychange`)
2. `initialSync.ts` had verbose `console.warn` logging on every table sync — these logs appeared on every initialSync call (page load, tab switch back), creating console spam

## Fix
Removed all `console.warn` debug logging from `initialSync.ts`. The sync still runs silently — no console output unless there's an actual error. Also removed the unused `label` parameter from the `syncTable` helper.

## Files changed
- `src/lib/initialSync.ts` — removed all console.warn calls, removed unused label parameter
- `src/App.tsx` — (prior commit) replaced focus with visibilitychange

## Commit
fix(initialSync): remove verbose console.warn logging that spammed on every sync
