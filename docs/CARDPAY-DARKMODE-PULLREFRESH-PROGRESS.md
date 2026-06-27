# Card Payment Modal, Dark Mode, Pull-to-Refresh — Progress

**Branch:** codex/cardpay-darkmode-pullrefresh
**Date:** 2026-06-27

| Item | Status | Commit | Notes |
|------|--------|--------|-------|
| 1. Remove duplicate Close/Maybe later buttons | DONE | 9419fc8 | BottomSheet header X button suffices |
| 2. Dark mode persists on login | DONE | 0a4956e | useTheme re-evaluates on route change via useLocation |
| 3. Pull-to-refresh for PWA/mobile | DONE | 6759a6d | Touch listeners on window, 80px threshold, Loader2 spinner |

## Verification
- npm run lint: PASS
- npm run build: PASS (2459 modules, 10.35s)
