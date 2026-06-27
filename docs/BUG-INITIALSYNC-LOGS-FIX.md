# Bug Fix: initialSync console logs firing on every click

## Repro
Console shows `[initialSync]` logs (e.g. "synced 82 rows", "Starting...", "Complete") appearing on every click within the app.

## Root cause
Three compounding issues:
1. `window.focus` event fires on every click within desktop browser pages (not just returning from background) — fixed by replacing with `visibilitychange`
2. `initialSync.ts` had verbose `console.warn` logging on every table sync — fixed by removing all console statements
3. `pwa/index.html` had no `Cache-Control: no-cache` header — Cloudflare's edge cache served the old `pwa/index.html` (with the old SW registration), so users never got the updated SW that would serve the new bundle. The old SW persisted indefinitely, serving the old cached bundle with the `console.warn` logging.

## Fix
- `src/App.tsx`: replaced `window.addEventListener('focus', ...)` with `document.addEventListener('visibilitychange', ...)` — visibilitychange only fires on actual tab/app background→foreground transitions, never on clicks
- `src/lib/initialSync.ts`: removed all `console.warn` debug logging
- `pwa/index.html`: added SW auto-update (`reg.update()` every 60s + `controllerchange` reload) so users get new code without manual refresh
- `public/_headers`: added `Cache-Control: no-cache, no-store, must-revalidate` for `/pwa/index.html` so Cloudflare always serves the latest version

## Files changed
- `src/App.tsx` — visibilitychange instead of focus
- `src/lib/initialSync.ts` — removed console.warn logging
- `pwa/index.html` — SW auto-update mechanism
- `public/_headers` — no-cache for pwa/index.html

## Commits
- `056cf01` fix(sync): use visibilitychange instead of focus
- `7135401` fix(initialSync): remove verbose console.warn logging
- `d11ced5` fix(sw): add auto-update + controllerchange reload
- `67c8853` fix(cache): add no-cache header for pwa/index.html
