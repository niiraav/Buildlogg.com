# BR-1 + BR-2 + BR-5 — Quick Requote, Outstanding Balance, Deposit Badge

> **Commit:** (6b14619)
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build + lint green

---

## Items

| # | Feature | Files | Status | Commit |
|---|---------|-------|--------|--------|
| BR-1 | Quick Requote from JobDetail | QuoteBuilder.tsx, Quote/index.tsx, JobDetail/index.tsx | ✅ Done | (6b14619) |
| BR-2 | Outstanding balance on Jobs list | Jobs/index.tsx | ✅ Done | (6b14619) |
| BR-5 | Deposit status badge on Jobs list | Jobs/index.tsx | ✅ Done | (6b14619, fe3e847) |

---

## BR-1 — Quick Requote

- QuoteBuilder: added `sourceJobId` prop. When provided (inside the else block where a new job is created), clones title + payment terms + deposit_pct + line items from the source job. Items get new UUIDs + new job's ID.
- Quote/index: added `sourceJobId` to LocationState, `'requote'` to EntryPoint, step initialization checks `initialSourceJobId`, passes prop to QuoteBuilder, onBack handles requote.
- JobDetail: "Create similar quote" button in renderPaidFooter (below Close), renderNoShowFooter (text link), renderTerminalFooter (below Go Home). All guarded with `!job?.is_sample`.

## BR-2 — Outstanding Balance

- Jobs screen loads payments via useLiveQuery, computes `paymentSummary().amountDue` per job.
- `awaiting_payment` sub-line shows "· £X.XX due" in red when `amountDue > 0`.

## BR-5 — Deposit Badge

- `booked` and `in_progress` sub-lines now use `flex` wrapper.
- When `payment_terms === 'deposit'`: green "Deposit paid" pill if `deposit_status === 'paid'`, amber "Deposit due" pill if `deposit_status === 'requested'`.

---

## Build Verification

```
$ npx tsc --noEmit — zero errors
$ npx vite build — ✓ built, 99 precache entries
$ npm run lint — zero errors
```

---

*Last updated: 2026-06-28*
*Author: Codex*
