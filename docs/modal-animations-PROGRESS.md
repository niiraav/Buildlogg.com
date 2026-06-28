# Smooth Modal Animations App-Wide — Progress Log

> Plan: in thread above (amended plan)
> Commit: 1b1f0a3

## Implementation items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | BottomSheet: isVisible enter animation (double rAF), onTransitionEnd e.target check, rapid-toggle rAF cancellation, prefers-reduced-motion, coordinated 300ms/250ms timing | ✅ Done | 1b1f0a3 |
| 2 | InstallModal (AddToHomeScreen): shouldRender+isVisible+isAnimatingOut pattern, 280ms card fade+scale, 250ms backdrop fade | ✅ Done | 1b1f0a3 |
| 3 | PhotoGallery viewer: fade+zoom enter/exit, pointerEvents gating during animation | ✅ Done | 1b1f0a3 |
| 4 | Landing page modal: CSS opacity/visibility transitions (replacing display:none/flex), card scale-up, cache buster v=11→v=12 | ✅ Done | 1b1f0a3 |

## Verification

| Check | Status | Notes |
|-------|--------|-------|
| `npm run lint` (tsc --noEmit) | ✅ Pass | Exit 0 |
| `npm run build` (tsc + vite + PWA) | ✅ Pass | Exit 0 |
| Dist output verified | ✅ | landing.css?v=12 in dist/index.html, install-modal CSS transitions in dist/assets/landing.css |

## Key design decisions

- **Double rAF** for enter animation trigger — single rAF fails in Chrome's batched rendering
- **e.target check in onTransitionEnd** — only the sheet/card's own transition triggers unmount, not the backdrop's faster (250ms vs 300ms) transition
- **Rapid toggle rAF cancellation** — prevents isVisible=true from firing after user already closed
- **prefers-reduced-motion** — skips rAF delay and sets fallback timeout to 0ms for instant appear/disappear
- **Body scroll lock** — unchanged, stays active during exit animation (correct behavior)
- **Landing page uses visibility instead of display** — allows CSS transitions while hiding from a11y tree

*Last updated: 2026-06-28*
