# W3-1: Smart Reminders & Auto-Messaging — Progress

## Summary
Automate the recurring job reminder layer. Adds `reminder_mode` per recurring job (remind_me / remind_client / both), server-side cron endpoint for auto-sending email to clients via Resend + push notifications to merchants, Settings screen for configuring defaults, and reminder history in the recurring task card sheet.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | db.ts: ReminderMode type, 5 RecurringJob fields, 4 Profile fields, ReminderLog interface, Dexie v10, recurring_reminder TemplateCategory, 4 WorkLogType values | ✅ Done | abbe74e |
| 2 | recurringJobs.ts: setReminderMode, updateReminderLeadDays, getReminderHistory, advanceRecurrence + reactivateDormant reset, createRecurringJob profile lookup | ✅ Done | abbe74e |
| 3 | templateEngine.ts: {bookingLink} placeholder | ✅ Done | abbe74e |
| 4 | seedMessageTemplates.ts: recurring_reminder template, flag bump v1→v2, dedup categories | ✅ Done | abbe74e |
| 5 | Settings/Reminders.tsx: mode toggle, channel select, push toggle | ✅ Done | 7bfe911 |
| 6 | App.tsx: route for /settings/reminders | ✅ Done | 7bfe911 |
| 7 | Settings/index.tsx: Automation section with Smart reminders nav row | ✅ Done | 7bfe911 (re-added after merge conflict with W3-3) |
| 8 | Home/index.tsx: recurring_actions sheet reminder info + change mode + edit timing sheets | ✅ Done | 7bfe911 |
| 9 | pushSubscription.ts: isPushSupported, subscribePush, unsubscribePush, getPushSubscription | ✅ Done | 7bfe911 |
| 10 | sw.ts: push event listener (notificationclick already existed) | ✅ Done | 7bfe911 |
| 11 | analytics.ts: captureReminderModeChanged, captureReminderLeadDaysChanged, capturePushSubscribed, capturePushUnsubscribed | ✅ Done | 7bfe911 |
| 12 | sync.ts: reminder_log in updateSyncStatus + hasSyncError | ✅ Done | 7bfe911 |
| 13 | initialSync.ts: reminder_log + payment_chases sync (pre-existing bug fix) | ✅ Done | 7bfe911 |
| 14 | realtime.ts: reminder_log in tableMap + INSERT-only subscription | ✅ Done | 7bfe911 |
| 15 | functions/api/cron-recurring-reminders.js: HTTP-triggered cron endpoint | ✅ Done | 7bfe911 |
| 16 | supabase/migrations/20260628000003_smart_reminders.sql: columns + table + RLS + CHECK constraint | ✅ Done | 7bfe911 |
| 17 | VAPID keys + CRON_SECRET env vars | ⬜ Manual setup needed | — |
| 18 | External scheduler (cron-job.org) | ⬜ Manual setup needed | — |

## Files Changed
- src/lib/db.ts — ReminderMode, RecurringJob fields, Profile fields, ReminderLog, Dexie v10
- src/lib/recurringJobs.ts — setReminderMode, updateReminderLeadDays, getReminderHistory, advanceRecurrence/reactivateDormant reset
- src/lib/templateEngine.ts — {bookingLink} placeholder
- src/lib/seedMessageTemplates.ts — recurring_reminder template, flag bump, dedup categories
- src/lib/pushSubscription.ts (NEW) — Web Push subscription manager
- src/lib/analytics.ts — 4 new analytics functions
- src/lib/sync.ts — reminder_log in updateSyncStatus + hasSyncError
- src/lib/initialSync.ts — reminder_log + payment_chases sync
- src/lib/realtime.ts — reminder_log tableMap + INSERT-only subscription
- src/sw.ts — push event listener
- src/screens/Settings/Reminders.tsx (NEW) — mode toggle, channel, push toggle
- src/screens/Settings/index.tsx — Automation section
- src/screens/Settings/MessageTemplates.tsx — recurring_reminder category
- src/screens/Home/index.tsx — recurring_actions reminder info + mode/timing edit sheets
- src/App.tsx — /settings/reminders route
- functions/api/cron-recurring-reminders.js (NEW) — cron endpoint
- supabase/migrations/20260628000003_smart_reminders.sql (NEW) — migration

## Verification
- npx tsc --noEmit — 0 errors
- npx vite build — passes, SW built with push listener

## Manual Setup Required
1. Run migration in Supabase SQL Editor: 20260628000003_smart_reminders.sql
2. Generate VAPID keys: `npx web-push generate-vapid-keys`
3. Add to Cloudflare env: VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET
4. Set up external scheduler (cron-job.org) to GET https://buildlogg.com/api/cron-recurring-reminders with Authorization: Bearer <CRON_SECRET> at 09:00 BST daily
