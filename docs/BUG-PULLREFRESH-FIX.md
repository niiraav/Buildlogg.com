# Bug Fix: Pull-to-refresh causing whole frame scroll on mobile browsers

## Repro
On Comet browser (and other iOS WebView-based browsers), the entire page frame (including app nav bar and sticky header) scrolls beyond the viewport. The TabBar (Home, Jobs, etc.) is hidden behind the browser's native nav bar.

## Root cause
`usePullToRefresh` hook registered a `touchmove` listener on `window` with `{ passive: false }`. A non-passive touchmove listener on window signals to the browser that the page may call `preventDefault()`. On some mobile browsers (Comet, iOS WebView-based), this disables the browser's native scroll boundary protection. With `body` having no `overflow: hidden` and `min-height: 100dvh`, the entire document scrolls beyond the viewport.

## Fix
Removed `usePullToRefresh` hook entirely and its usage in `ScreenTracker`. The focus handler (already in App.tsx) refreshes data when the user returns to the app — pull-to-refresh is not needed and causes harmful side effects on mobile browsers.

## Files changed
- `src/hooks/usePullToRefresh.ts` — deleted
- `src/App.tsx` — removed usePullToRefresh import, Loader2 import, and pull-to-refresh visual indicator from ScreenTracker

## Commit
fix(pull-to-refresh): remove hook that caused whole frame scroll on mobile browsers
