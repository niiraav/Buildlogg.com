# JobDetail Status, Payment & Sync Audit

## Overall verdict

The simple happy path works, but the code lacks guards, has inconsistent sync, and has incomplete status actions. This is why the user saw **Paid x4 for the same job** and why activity data can disappear on a fresh preview origin.

## What is working

- Job status → body/footer mapping is generally correct.
- Invoice numbering and payment method change are correct and idempotent.
- The typed Dexie schema is a solid foundation.
- Basic push-sync retry mechanism exists.

## Critical bugs

| # | Bug | Why it matters |
|---|---|---|
| 1 | **Duplicate / over payments allowed** — `handleMarkDone` and `handleMarkAsPaid` create a new `payments` row and a new `work_log` row every time they run, with no guard against an already-paid job. | This is the root cause of the **Paid x4** activity feed issue. It also creates over-payment data. |
| 2 | **`handleMarkAsPaid` records `amount: total` even when `type` is `balance`** — when prior payments exist, it still records the full total instead of the remaining balance. | Deposit and balance jobs become over-paid. |
| 3 | **`handleMarkDone` ignores `payment_terms` / `deposit_pct`** — Home already has deposit-aware logic; JobDetail does not. | Inconsistent financial behavior across screens. |
| 4 | **Wrong sync operation type** — `addToSyncQueue` always uses `operation: 'update'`. New `payments`, `line_items`, and jobs are queued as `update`, so Supabase silently affects 0 rows and the record is lost server-side. | Data created in JobDetail is not actually synced to Supabase. |
| 5 | **Wrong sync IDs for work logs** — `handleAddCharge` and `handleAddNote` use the line-item/job ID as the `work_log` sync ID. | Sync worker tries to update the wrong remote row or fails. |
| 6 | **Most local mutations are never queued** — status changes, work logs, cancellations, no-shows, etc. are written to IndexedDB but not added to `sync_queue`. | Offline changes stay local forever and can be overwritten by `initialSync`. |
| 7 | **`initialSync` overwrites pending local changes** — `bulkPut` pulls remote data without checking `_sync_status === 'pending'` or resolving conflicts by timestamp. | Split-brain data, especially across devices. |

## Medium issues

| # | Issue | Notes |
|---|---|---|
| 8 | Dead sheets: `add_charge` and `add_note` are defined but never opened from the UI. | Even if wired, their sync IDs are wrong. |
| 9 | No quote actions for `quoted` status: no cancel/resend from JobDetail. | Users can only mark a quote as booked. |
| 10 | No write-off path to `written_off` status. | `written_off` is terminal but nothing creates it. |
| 11 | No-show, reschedule, and reminder events do not appear in the Activity feed. | `activityFilter.ts` does not match those descriptions. |
| 12 | Activity filter is string-based and double-counts. | It parses free-text descriptions like `Payment recorded` and can double-count `jobsCompleted` if both a milestone and a status-change log exist. |
| 13 | No global two-way sync after initial load. | Only push sync exists; no periodic pull or realtime. |
| 14 | Cancelled body has a non-interactive “Tap to add a note” placeholder. | UI dead end. |
| 15 | `handleMarkDone` has duplicate `hapticSuccess` / `showSuccess` calls. | Minor polish issue. |

## Recommended approach

### Phase 1: Fix the payment guard (highest impact, smallest change)

1. Compute `totalPaid` and `amountDue` before any payment action.
2. If `job.status === 'paid'` or `amountDue <= 0`, block the action with a message like “Already paid.”
3. Record the actual remaining amount, not the full total.
4. Add loading/disabled states to the bottom-sheet buttons so double-taps cannot create duplicates.
5. If a user changes the payment method, log it as `Payment updated` rather than creating a new `Payment recorded`.

### Phase 2: Fix sync integrity

1. Change `addToSyncQueue` to accept the correct `operation` (`insert`/`update`/`delete`) and use it everywhere.
2. Ensure every new `work_log` is queued with its own real UUID as `record_id`.
3. Audit every local mutation in `JobDetail`, `Home`, and `Quote` and ensure it is queued.
4. Make `initialSync` conflict-aware (check `_sync_status`, use timestamps, or delete old data first).

### Phase 3: Complete the status lifecycle

1. Wire the dead `add_charge` / `add_note` sheets from the **More options** menu.
2. Add **Cancel quote** and **Resend quote** actions for `quoted` status.
3. Add a **Write off** action for `awaiting_payment` (and possibly `paid`).
4. Extract shared deposit/balance payment logic from `Home` and reuse it in `JobDetail`.
5. Rename misleading CTA labels (e.g., “Complete & take payment” while offering “Not yet”).

### Phase 4: Make the Activity feed reliable

1. Make `activityFilter.ts` type-driven: use `WorkLogType` and a dedicated `activity_type` field instead of parsing descriptions.
2. Add explicit activity types for no-show, callout charge, reminder, and payment amendment.
3. Deduplicate summary counts by job ID per day.
4. Implement periodic pull or Supabase realtime so multi-origin data converges.

## Bottom line

The **Paid x4** bug is a real, reproducible bug caused by missing duplicate-payment guards. The empty Activity page on the new preview is a per-origin IndexedDB issue, not a code bug. The deeper risk is that much of the data created in JobDetail is either not synced or synced incorrectly, which will cause silent data loss once the app is used across devices.
