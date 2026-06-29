# Customer Notification Gaps — Progress

## Summary
Auto-open SendSheet with pre-filled message after state changes that affect the customer. Uses existing SendSheet + getFilledTemplateMessage pattern.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| Helper | logCustomerNotified shared helper | ✅ Done | 6a0d353 |
| Gap 1 | Reschedule — SendSheet with new date/time | ✅ Done | 6a0d353 |
| Gap 2 | Cancellation — SendSheet with cancellation message | ✅ Done | 6a0d353 |
| Gap 3 | No-show — SendSheet with reschedule request | ✅ Done | 6a0d353 |
| Gap 5 | Job complete + invoice — SendSheet with PDF attachment | ✅ Done | 6a0d353 |
| Gap 4a | Payment receipt (handleMarkDone) — auto-open + review chain | ✅ Done | 6a0d353 |
| Gap 4b | Payment receipt (handleMarkAsPaid) — auto-open + review chain | ✅ Done | 6a0d353 |
| Gap 7a | £0.00 job (handleMarkDone) — no-charge message | ✅ Done | 6a0d353 |
| Gap 7b | £0.00 job (handleMarkAsPaid) — no-charge message | ✅ Done | 6a0d353 |
| Gap 6 | Start job — SKIPPED (showToast doesn't support actions) | ⏭️ Skipped | — |
| Gap 8 | Status revert — SKIPPED (admin correction) | ⏭️ Skipped | — |
| Verify | TypeScript clean | ✅ Done | — |
| Verify | Vite build clean | ✅ Done | — |

## Files Changed
- `src/screens/JobDetail/index.tsx` — 160 insertions, 21 deletions across 7 handler functions + 1 shared helper
