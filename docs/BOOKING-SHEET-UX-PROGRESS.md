# Booking Request Sheet UX — Progress

**Branch:** codex/booking-sheet-ux
**Date:** 2026-06-27

| Item | Status | Commit | Notes |
|------|--------|--------|-------|
| 1. BottomSheet scroll lock (iOS-safe) | DONE | 4147c56 | position:fixed body pattern + overscroll-contain |
| 2. Booking request sheet information hierarchy | DONE | e49881e | Client name as heading, date/time in subtitle, conflict badge below name |
| 3. Remove redundant summary card chevron | DONE | 2338072 | Removed "View all →" row, header ArrowRight suffices |
| 4. Booking list sheet item hierarchy | DONE | 2338072 | Name + date on line 1, service + amount on line 2 |

## Verification
- npm run lint: PASS
- npm run build: PASS (2458 modules, 27.12s)
