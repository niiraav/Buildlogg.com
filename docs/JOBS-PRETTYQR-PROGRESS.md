# Jobs Page + Pretty QR Code — Implementation Progress

**Branch:** codex/jobs-prettyqr
**Date:** 2026-06-27

## Part 1 — Jobs Page Improvements

| Item | Status | Commit | Notes |
|------|--------|--------|-------|
| 1a. Merged sticky header (header + date banner + filter chips + search) | DONE | e00691c | All in one sticky top-0 z-40 container |
| 1b. Sticky snap-to-top group headers via ResizeObserver | DONE | e00691c | position: sticky with top: headerHeight (measured via ResizeObserver) |
| 1c. Filter chip counts | DONE | e00691c | All/Active/Unpaid counts from searchFilteredJobs |
| 1d. Summary strip | DONE | e00691c | "N active, N unpaid, GBP N awaiting" — labelled awaiting not outstanding |
| 1e. Subtle group background tinting | DONE | e00691c | CSS variables via inline style (blue/amber/green/red) |
| 1f. Smooth expand/collapse with framer-motion | DONE | e00691c | AnimatePresence + motion.div, 200ms easeInOut |
| 1g. Sticky header shadow on scroll | DONE | e00691c | passive scroll listener toggles shadow-sm |

## Part 2 — Pretty QR Code

| Item | Status | Commit | Notes |
|------|--------|--------|-------|
| 2a. Install qr-code-styling | DONE | f2fbd47 | v1.9.2 with TypeScript definitions |
| 2b. Create src/lib/prettyQr.ts helper | DONE | f2fbd47 | Factory: rounded dots, brand-black, embedded logo, high ECC, quiet zone |
| 2c. Update Booking.tsx QR rendering | DONE | f2fbd47 | Container div ref, update() for slug changes, download() for PNG |
| 2d. Background styling (rounded-2xl white card) | DONE | f2fbd47 | Rounded card wrapper |
| 2e. Logo asset + merchant logo fallback | DONE | f2fbd47 | /brand/icon-transparent-square-v2.png, falls back to profile.logo_data_url |

## Verification

- npm run lint: PASS (tsc --noEmit clean)
- npm run build: PASS (2458 modules, 6.65s)
