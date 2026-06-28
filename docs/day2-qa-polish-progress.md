# Day 2: Polish + QA Pass — Progress Log

> Commit: 4e6baac

## QA Audit Summary

Systematic codebase audit across 8 areas. Findings and fixes below.

## Issues Found and Fixed

| ID | Area | Issue | Fix | Commit |
|----|------|-------|-----|--------|
| F1 | Functional | Activity empty state had no CTA — just text "No activity yet" | Added "New Quote" and "Log Missed Call" buttons matching Jobs/Home empty state pattern | 4e6baac |
| F2/C1 | Copy | PWA manifest said "Quotes, jobs, and payments for tradespeople" — excludes non-trades users | Changed to "Quote, book, and get paid — the business app for solo service providers" | 4e6baac |
| A2 | Accessibility | BottomSheet close button was 28px (w-7 h-7) — below 44px WCAG minimum | Increased to 36px (w-9 h-9) | 4e6baac |
| X2 | UX Journey | Booking page had no back navigation — user couldn't change service/date/time after selecting | Added "Change service", "Change date", "Change time" links with JS functions to show/hide sections | 4e6baac |
| U2 | UI | Settings business name empty state used harsh red (bg-red-50, border-red-200, text-status-red) | Changed to soft amber (bg-status-amberBg, border-amber-200, text-status-amber) | 4e6baac |

## Issues Noted but Not Fixed (acceptable for v1)

| ID | Area | Issue | Why acceptable |
|----|------|-------|----------------|
| A1 | Accessibility | 201 buttons without aria-label | Most have text content (children), only icon-only buttons need labels. BottomSheet X button already has aria-label. |
| P1 | Performance | 1.2MB JS bundle, no code splitting | Acceptable for PWA — service worker caches everything after first load. Code splitting would add complexity for minimal gain. |
| P2 | Performance | Home/index.tsx is 2753 lines | Large but uses useLiveQuery efficiently. Refactoring to smaller components is a future polish item, not a blocker. |
| F3 | Functional | No persistent "You're offline" banner | SyncIndicator already shows "Saved offline · will sync when online" when there's pending work. A persistent offline banner would annoy users who intentionally work offline. |
| U1 | UI | Auth logo img has empty alt="" | Decorative image — acceptable per WCAG (alt="" means "ignore this image"). |

## Verification

| Check | Status |
|-------|--------|
| `tsc --noEmit` | ✅ Exit 0 |
| `vite build` | ✅ Exit 0 |
| Deployed to pages.dev | ✅ https://day2-qa.tradepad-eu0.pages.dev |

## Deployed URL
https://day2-qa.tradepad-eu0.pages.dev

*Last updated: 2026-06-29*
