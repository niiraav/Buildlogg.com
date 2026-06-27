# Bug Fix: initialSync firing on every click

## Repro
On desktop browsers, clicking anywhere in the app triggers `[initialSync]` console logs — a full Supabase data pull (14 tables, 467+ rows) runs on every click.

## Root cause
`handleFocus` listened to the `window` `focus` event, which on desktop browsers fires on every click within the page (not just when returning from background). The 30s throttle (`lastFullSync`) didn't help because it started at `0`, and `Date.now() - 0` is always > 30000.

## Fix
Replaced `window.addEventListener('focus', ...)` with `document.addEventListener('visibilitychange', ...)`. `visibilitychange` only fires when the page's visibility actually changes (tab switch, app background → foreground) — never on clicks within the page. Removed the throttle (no longer needed — visibilitychange doesn't fire on clicks).

## Files changed
- `src/App.tsx` — replaced handleFocus + focus listener with handleVisibilityChange + visibilitychange listener

## Commit
fix(sync): use visibilitychange instead of focus to avoid initialSync on every click
