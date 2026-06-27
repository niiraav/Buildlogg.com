# Bundle Optimization — Remove framer-motion + Lazy-load jspdf

**Branch:** codex/remove-framer-motion
**Date:** 2026-06-28

## Results

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Main bundle (raw) | 1,735 KB | 1,226 KB | 509 KB (29%) |
| Main bundle (gzip) | 516 KB | 336 KB | 180 KB (35%) |
| Separate chunks | 0 | 3 (jspdf 390KB, autotable 31KB, html2canvas 201KB) | Lazy-loaded |

## Items

| Item | Status | Commit | Notes |
|------|--------|--------|-------|
| 1a. BottomSheet — CSS + touch handler | DONE | 3b3db87 | shouldRender pattern, native touch swipe-to-dismiss |
| 1b. Toast — CSS transitions | DONE | 2e90145 | Controlled unmount with CSS |
| 1c. AddToHomeScreen — CSS | DONE | 2e90145 | Backdrop fade + modal slide via CSS |
| 1d. HomeTabSwitcher — CSS | DONE | 2e90145 | transition-all for underline |
| 1e. Skeleton FadeIn — CSS | DONE | 2e90145 | @keyframes fadeIn |
| 1f. globals.css — fadeIn keyframe | DONE | 2e90145 | Added after pulse keyframe |
| 1g. npm uninstall framer-motion | DONE | 2e90145 | Zero remaining imports |
| 2a. pdfGenerator — async dynamic import | DONE | 59ac5d2 | import('jspdf') inside function body |
| 2b. SendSheet — async interface | DONE | 59ac5d2 | generatePdf: () => Promise<Blob> |
| 2c. Update callers | DONE | 59ac5d2 | Settings, JobDetail, QuotePreview all await |

## Verification
- npm run lint: PASS
- npm run build: PASS (2060 modules, 5.77s)
- grep -rn 'framer-motion' src/: 0 results (only a comment in BottomSheet)
