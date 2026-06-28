# Compact Week Strip in Jobs Header + Scroll-to-Hide — Progress

## Summary
Replace Jobs screen heavy header with a compact two-layer header: scroll-to-hide week strip + always-visible filter chips/search. Remove "Jobs" title, summary strip, and date filter banner. Add WeekView BottomSheet accessible via expand button.

## Items

| # | Item | Status | Commit | Verified |
|---|------|--------|--------|----------|
| 1 | CompactWeekStrip component (7 day cells, dots, expand, clear) | ✅ Done | 22e0187 | TSC 0 errors, build ✓ |
| 2 | useScrollHide hook (native window scroll listener, rAF throttle) | ✅ Done | 22e0187 | TSC 0 errors |
| 3 | Jobs header restructure (remove title/summary/banner, add strip + WeekView sheet) | ✅ Done | 22e0187 | TSC 0 errors, build ✓ 2066 modules |
| 4 | Date filter integration (tap day → searchParams, clear button) | ✅ Done | 22e0187 | Code review: uses existing dateFilteredJobs useMemo |
| 5 | Build passes | ✅ Done | 22e0187 | npx vite build → ✓ 2066 modules + ✓ SW |

## Files Changed
- src/components/CompactWeekStrip/index.tsx (NEW) — 7 day cells with status dots, expand button, clear button
- src/hooks/useScrollHide.ts (NEW) — native scroll-to-hide hook, window scroll, rAF throttle
- src/screens/Jobs/index.tsx — header restructure, WeekView BottomSheet, lineItemsMap, removed title/summary/banner

## Verification
- npx tsc --noEmit — 0 errors (excluding pre-existing AddToHomeScreen/Sprint3)
- npx vite build — ✓ 2066 modules transformed, ✓ SW built
- CompactWeekStrip: 2 references in Jobs, component renders 7 cells with dots
- WeekView BottomSheet: 5 references, opens via expand button
- useScrollHide: 3 references, returns visible boolean
- No "Jobs" title (0 matches), no summary strip (0 matches), no date banner (0 matches)
