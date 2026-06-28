# Today CTA + Empty State Polish + Activity Desktop Fix — Progress Log

> **Commit:** b880cd5
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build + lint green

---

## Items

| # | Fix | File | Status | Commit |
|---|-----|------|--------|--------|
| 1 | Footer CTA always visible on Today tab | `src/screens/Home/index.tsx` | ✅ Done | b880cd5 |
| 2 | Remove duplicate buttons from renderNoJobsToday | `src/screens/Home/index.tsx` | ✅ Done | b880cd5 |
| 3 | Remove duplicate buttons from renderAllClear | `src/screens/Home/index.tsx` | ✅ Done | b880cd5 |
| 4 | Coffee icon for "No jobs today" (distinct from Calendar) | `src/screens/Home/index.tsx` | ✅ Done | b880cd5 |
| 5 | Spacing mt-5 on "Needs your attention" label | `src/screens/Home/index.tsx` | ✅ Done | b880cd5 |
| 6 | "View all tasks →" without misleading count | `src/screens/Home/index.tsx` | ✅ Done | b880cd5 |
| 7 | Chevron on "Sunday · no jobs scheduled" label | `src/screens/Home/index.tsx` | ✅ Done | b880cd5 |
| 8 | No-show contextLine shows phone, not scheduled time | `src/screens/Home/index.tsx` | ✅ Done | b880cd5 |
| 9 | Activity page desktop width constrained to 600px | `src/screens/Activity/index.tsx` | ✅ Done | b880cd5 |

---

## Build Verification

```
$ npx tsc --noEmit
(zero errors)

$ npx vite build
✓ built in 139ms
PWA v0.20.5 — 99 precache entries

$ npm run lint
(zero errors)
```

---

*Last updated: 2026-06-28*
*Author: Codex*
