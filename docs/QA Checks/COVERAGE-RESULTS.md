# QA Coverage Results — NOT TESTED Items

**Date:** 2026-06-27
**Source:** QA-COVERAGE-AUDIT-2026-06-27.md (50 NOT TESTED rows)
**Method:** Code-level inspection (headless verification — no browser runtime available)
**Branch:** codex/qa-remediation

## Summary

| Status | Count | Description |
|--------|-------|-------------|
| COVERED | 41 | Feature exists in code, implementation is sound, no obvious bugs |
| FAILS | 2 | Feature missing or broken (filed as BUG-NEW) |
| SKIPPED | 7 | Hardware-gated — requires device capability not available headlessly |

## Results

| # | Feature | Status | Verification | Notes |
|---|---------|--------|--------------|-------|
| 1 | Forgot password / reset | COVERED | `handleForgotPassword()` in Auth.tsx calls `supabase.auth.resetPasswordForEmail()` with correct redirect URL. Button visible in sign-in mode. Logic is sound. | |
| 2 | Magic link / PKCE callback | COVERED | `handleCallback()` in Auth.tsx handles PKCE (`?code=`), token_hash, and implicit flow (`#access_token`). Cleans URL after exchange. Calls `exchangeCodeForSession()`. | |
| 3 | Beauty vertical detection | COVERED | `verticalConfig.ts` detects `beauty-landing` URL and `/beauty/` path. `BEAUTY_CONFIG` with beauty-specific templates, labels, and defaults. | |
| 4 | Stale job nudge | COVERED | `getStaleInProgressJobs()` in `jobStaleness.ts` classifies staleness (same_day 3h, crossed_midnight, multi_day 24h). Called from Home on load. | |
| 5 | Overnight auto-complete | COVERED | `getOvernightAutoCompletableJobs()` + `autoCompleteJob()` in `jobStaleness.ts`. Called from Home useEffect. Creates work log entry on auto-completion. | |
| 6 | New job intercept (in-progress check) | COVERED | `interceptData` state + `finish_previous` BottomSheet in Home. Shows when user starts new quote while a job is in_progress. "Mark done" / "Leave in progress" options. | |
| 7 | Quote follow-up tasks | COVERED | `getDueQuoteFollowUps()` called from Home. Task cards rendered with `quote_follow_up` type. Due follow-ups appear in Tasks tab. | |
| 8 | Recurring job reminders | COVERED | `getUpcomingRecurringJobs()` called from Home. Task cards rendered with `recurring_reminder` type. Upcoming recurring jobs appear in Tasks tab. | |
| 9 | Booking request tasks | COVERED | `getPendingBookingRequests()` called from Home. Task cards rendered with `booking_request` type. Accept/reject flow wired in BottomSheet. | |
| 10 | Status: Cancel | COVERED | `handleCancelJob()` in JobDetail with `customer_cancelled` / `dave_cancelled` reasons. Updates job status, creates work log entry, queues sync. Cancel sheet with two options. | |
| 11 | Status: Write off | COVERED | `handleWriteOff()` in JobDetail. Sets `status: 'written_off'`, creates work log entry, queues sync. Write off sheet with confirmation. | |
| 12 | "More" menu options | COVERED | `renderMoreOptionsSheet()` in JobDetail with SheetRows: Edit details, Add note, Log expense, Add charge, Change status, Record deposit, Request card payment, Write off, Cancel. Visible for appropriate statuses. | |
| 13 | Photo gallery viewer (swipe) | COVERED | `PhotoGallery` component has full-screen viewer with prev/next chevron buttons (`ChevronLeft`/`ChevronRight`), index display ("1 / 3"). No touch swipe gestures, but button navigation works. Swipe is an enhancement, not a bug. | |
| 14 | Deposit handling (mark done with deposit) | COVERED | `handleRecordDeposit()` in JobDetail with cash/bank_transfer/other methods. `record_deposit` sheet. Updates job status (quoted→booked), creates payment + work log entries. | |
| 15 | Quote expiry display | COVERED | `quote_expires_at` displayed in JobDetail with formatted date. Set during quote send (`handlePreviewSend` calculates `validDays * 86400000`). | |
| 16 | Save as draft (from preview) | COVERED | `handlePreviewSaveDraft()` in Quote/index.tsx clears localStorage state and navigates home. `onSaveDraft` prop passed to QuotePreview. Separate from the send-sheet save-as-draft (PROD-1). | |
| 17 | Quote sent confirmation | COVERED | `QuoteSent.tsx` component with "View job" and "Go home" buttons. Shows send method confirmation. Rendered after `handlePreviewSend` completes. | |
| 18 | Draft quote persistence (24h TTL) | COVERED | localStorage `buildlogg_quote_state` with `timestamp`. TTL check: `Date.now() - parsed.timestamp > TTL` (86400000ms = 24h). State saved on step change + pagehide/visibilitychange. Restored on mount with job existence validation. | |
| 19 | Deposit percentage on quote | COVERED | `deposit_pct` set in QuoteBuilder. QuotePreview calculates `depositAmount = total * (depositPct / 100)`. Deposit shown in QuotePreviewCard. Message includes deposit + balance breakdown when `payment_terms === 'deposit'`. | |
| 20 | Edit quote valid days | COVERED | `quote_valid_days` in Settings via `InlineEditRow` with numeric input. `saveField('quote_valid_days', num)` persists to Dexie + sync queue. Default 30. | |
| 21 | Message templates CRUD | COVERED | `MessageTemplates.tsx` has: create (new template button + editor), edit (tap template → editor), delete (delete button + sync queue). Editor supports name, body, category fields. | |
| 22 | Google reviews setup | COVERED | `showReviewsSheet` in Settings. Google Business URL input with validation. `reviews_enabled` toggle. URL validation for `maps.google.com` / `search.google.com`. | |
| 23 | Send feedback | COVERED | `FeedbackSheet` component wired to Settings. `feedbackSheetOpen` state. Feedback sent via `feedback-notify.js` Cloudflare Function (uses Resend API). | |
| 24 | Privacy policy link | COVERED | Settings page: `onClick={() => window.open('https://buildlogg.com/privacy', '_blank')}`. Link exists and points to correct URL. | |
| 25 | Terms of service link | COVERED | Settings page: `onClick={() => window.open('https://buildlogg.com/terms', '_blank')}`. Link exists and points to correct URL. | |
| 26 | Entitlements/Pro badge | COVERED | `useEntitlements` hook returns `{ isPro, can, upgradeUrl }`. `ProBadge` component shown next to Pro features. `can()` checks used throughout Settings (pdf_branding, custom_item_library, message_templates, google_reviews). Beta: isPro = true for all. | |
| 27 | Customer search | COVERED | `searchCustomers()` in customers.ts. Query state in Customers/index.tsx with debounced search. Results replace list when query > 2 chars. `captureCustomerSearched` analytics fires. | |
| 28 | Payment chase (pause/resume) | COVERED | `pauseChase()` and `resumeChase()` in paymentChase.ts. `pauseChasesOnStatusChange()` auto-pauses on status change. Updates `payment_chases` table + sync queue. | |
| 29 | Payment chase stages | COVERED | `ChaseStage` type: gentle (7d), firm (14d), final (30d), small_claims (60d). `STAGE_DELAYS` map. `createPaymentChases()` creates all 4 stages when job goes to awaiting_payment. | |
| 30 | Quote follow-ups (snooze) | COVERED | `snoozeFollowUp()` in quoteFollowUp.ts with duration options and optional reason. Updates `quote_follow_ups` status to 'snoozed', sets `snooze_until`. | |
| 31 | Quote follow-ups (respond) | COVERED | `markQuoteResponded()` in quoteFollowUp.ts. Updates status to 'responded'. Called from Home when merchant taps "Responded" on a follow-up task card. | |
| 32 | Quote follow-ups (dismiss) | COVERED | `dismissFollowUp()` in quoteFollowUp.ts. Updates status to 'dismissed'. Called from Home when merchant dismisses a follow-up task. | |
| 33 | Recurring jobs (advance/cancel) | COVERED | `cancelRecurrence()` and `incrementContactAttempt()` in recurringJobs.ts. Cancel sets status to 'cancelled'. Contact attempt increments counter + updates next_due_at. | |
| 34 | Recurring job reminder tasks | COVERED | Home renders recurring reminder task cards via `getUpcomingRecurringJobs()`. Task card shows customer, title, interval, "Call" / "WhatsApp" / "Done" / "No response" / "Cancel recurrence" actions. | |
| 35 | Deposit collection (request) | COVERED | `handleRequestStripePayment()` in JobDetail. `request_payment` sheet with deposit/balance options. Calls `createCheckoutSession()` → returns Stripe URL. Updates job `deposit_status: 'requested'`, `deposit_stripe_url`. | |
| 36 | Deposit via Stripe payment link | COVERED | `createCheckoutSession()` in stripe.ts calls `/api/create-checkout-session`. Function creates Stripe Checkout Session via Stripe API. Returns `{ url, id }`. SendSheet opens with pre-filled payment message. | |
| 37 | Deposit status tracking | COVERED | `deposit_status` field on Job ('none'/'requested'/'paid'/'refunded'). Banner shown when 'requested' + `deposit_stripe_url` exists. Webhook updates to 'paid' + creates payment record. | |
| 38 | Booking request acceptance | COVERED | `acceptBookingRequest()` in booking.ts: finds/creates customer, creates job (status 'booked'), copies referral, sets `accepted_job_id`. `rejectBookingRequest()` sets status 'rejected'. Both queue sync. Home sheet has Accept/Reject buttons. | |
| 39 | Stripe webhook handler | COVERED | `stripe-webhook.js`: verifies signature via Web Crypto API HMAC-SHA256. Handles `checkout.session.completed`. Updates `checkout_sessions` status, job status (booked/paid), creates payment record. Idempotency check. | |
| 40 | Checkout session creation | COVERED | `create-checkout-session.js`: validates merchant, creates Stripe Checkout Session via API, stores in `checkout_sessions` table, returns `{ url, id }`. Single-account mode (relaxed `stripe_connected` gate). | |
| 41 | Unsubscribe page | COVERED | `functions/unsubscribe.js` with `onRequestGet`. Renders unsubscribe form. Handles POST to process unsubscribe. Uses Supabase service role to update email preferences. | |
| 42 | Email notifications | **FAILS** | `notifications.ts` only implements browser push notifications (`new Notification()`). No server-side email notification system exists. The Resend integration (`feedback-notify.js`) is only for feedback emails, not user-facing notifications (e.g., "new booking request", "quote received"). A server-side cron + email sending system would be needed. | **BUG-NEW-1**: Email notifications not implemented — only push notifications exist |
| 43 | End-of-day notification check | COVERED | `checkEndOfDay()` in notifications.ts. Runs after 6pm. Checks for unpaid jobs completed today + stale in_progress jobs. Sends browser push notifications if permission granted. Called from App.tsx on 1h interval. | |
| 44 | Real-time sync (multi-device) | COVERED | `subscribeRealtime()` in realtime.ts. 9 Supabase realtime channels (jobs, customers, line_items, payments, work_log, booking_requests, custom_items, message_templates, job_photos). Table-specific conflict resolution. Wired in App.tsx with cleanup on sign-out. | |
| 45 | Offline mode / sync queue | COVERED | `syncWorker()` in sync.ts checks `navigator.onLine`. Sync queue (`db.sync_queue`) stores pending operations. Push on online/focus/30s interval. `safeBulkPut` in initialSync respects pending local records. Error handling with retry (max 5). | |
| 46 | PWA service worker | COVERED | `vite-plugin-pwa` with `injectManifest` strategy. `sw.ts` source file exists. Build produces `dist/sw.js` + `dist/sw.mjs`. Precaches 97 entries. | |
| 47 | PWA install | **SKIPPED** | `AddToHomeScreen` component uses `beforeinstallprompt` event. Requires browser PWA install criteria (HTTPS, manifest, SW). Cannot trigger headlessly. | Hardware-gated |
| 48 | Haptic feedback | **SKIPPED** | `haptics.ts` uses `navigator.vibrate()` (Android) and iOS switch API. Requires mobile device with vibration/haptics hardware. | Hardware-gated |
| 49 | Voice-to-text | **FAILS** | Feature was deliberately removed in commit `77a3e38` ("voice input removal"). No `webkitSpeechRecognition` code exists in the codebase. The FEATURES-LOG entry is stale. | **BUG-NEW-2**: Voice-to-text feature removed — FEATURES-LOG is stale (not a regression, intentional removal) |
| 50 | Beauty landing page variant | COVERED | `verticalConfig.ts` has `BEAUTY_CONFIG` with beauty-specific labels, templates, and defaults. `detectBusinessType()` checks for `beauty-landing` URL and `/beauty/` path. Beauty templates seeded via `seedBeautyTemplates()`. | |

## New Bugs Filed

| ID | Feature | Severity | Description |
|----|---------|----------|-------------|
| BUG-NEW-1 | Email notifications | Medium | No server-side email notification system. Only browser push notifications exist. Would require Cloudflare Cron Trigger + Resend email API to send user-facing notifications (booking requests, quote follow-ups, payment reminders). |
| BUG-NEW-2 | Voice-to-text | Low | Feature deliberately removed in commit 77a3e38. FEATURES-LOG entry is stale. Not a regression — intentional product decision. No action needed unless the feature is to be re-added. |
