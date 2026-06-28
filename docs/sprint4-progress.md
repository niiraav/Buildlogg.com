# Sprint 4: Quote Follow-Up + Payment Chase Email Channels — Progress Log

> Plan: Amended Sprint 4 plan (in thread above)
> Commit: f69dcde

## Implementation items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 18 | Quote follow-up email cron endpoint | ✅ Done | f69dcde |
| 19 | Payment chase email cron endpoint | ✅ Done | f69dcde |
| - | Migration: work_log type constraint fix (21 types) | ✅ Done | f69dcde |
| - | Migration: exec_sql RPC (explicit dependency) | ✅ Done | f69dcde |
| - | db.ts: message_method adds 'email' | ✅ Done | f69dcde |
| - | GitHub Actions: cron-quote-follow-ups.yml (08:00 UTC) | ✅ Done | f69dcde |
| - | GitHub Actions: cron-payment-chases.yml (08:15 UTC) | ✅ Done | f69dcde |

## Verification

| Check | Status | Notes |
|-------|--------|-------|
| `tsc --noEmit` | ✅ Pass | Exit 0 |
| `vite build` | ✅ Pass | Exit 0, PWA SW built |

## Skipped items

| # | Item | Reason |
|---|------|--------|
| 16 | SMS via Twilio | Needs external account — skip until user demand justifies |
| 17 | WhatsApp Business API | Needs Meta approval — skip until user demand justifies |

## Files changed

| File | Changes |
|------|---------|
| `functions/api/cron-quote-follow-ups.js` | NEW — cron endpoint for quote follow-up emails |
| `functions/api/cron-payment-chases.js` | NEW — cron endpoint for payment chase emails |
| `supabase/migrations/20260629000002_work_log_type_constraint.sql` | NEW — fixes CHECK constraint (21 types) |
| `supabase/migrations/20260629000003_exec_sql_rpc.sql` | NEW — makes exec_sql RPC explicit |
| `src/lib/db.ts` | message_method type: add 'email' |
| `.github/workflows/cron-quote-follow-ups.yml` | NEW — daily 08:00 UTC |
| `.github/workflows/cron-payment-chases.yml` | NEW — daily 08:15 UTC |

*Last updated: 2026-06-29*
