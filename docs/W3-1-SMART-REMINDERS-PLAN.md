# W3-1 Plan Audit — Codebase Verification

> **Auditor:** Hermes Agent
> **Date:** 2026-06-27
> **Plan audited:** `docs/W3-1-SMART-REMINDERS-PLAN.md`
> **Method:** Every file path, function name, interface field, and architecture claim verified against the live codebase.

---

## 1. VERDICT

**Needs amendments before implementation — 3 blockers, 5 gaps, 4 improvements.**

The plan is architecturally sound and grounded in the right existing systems. The recurring engine, template engine, sync infrastructure, and Cloudflare Functions patterns are all correctly identified. However:

1. **Cloudflare Pages does not support cron triggers** — the entire server-side activation layer needs rearchitecting
2. **No service worker is registered** — Web Push is impossible without one, and the plan doesn't include creating one
3. **`payment_chases` is missing from `initialSync`** — the plan repeats this omission for `reminder_log`

All three blockers have known solutions that don't change the feature scope. The amended plan below is ready to implement.

---

## 2. FINDINGS

### BLOCKERS

#### B1: Cloudflare Pages Functions do not support `scheduled()` handlers / cron triggers

**Evidence:**
- `wrangler.toml` configures a Pages project (`[assets]` directory, `not_found_handling`), not a Worker
- All existing Functions use `onRequestPost` / `onRequestGet` (Pages Function signatures), not `scheduled()` (Worker signature)
- Cloudflare Pages Functions only respond to HTTP requests — they cannot be cron-triggered
- The plan's R3.1 says "Exports `scheduled()` handler" and R3.2 adds `[triggers] crons = ["0 8 * * *"]` to `wrangler.toml` — this is a Workers feature, not a Pages feature

**Impact:** The entire Phase 2 (server-side reminder engine) won't deploy. The cron worker is the core of the feature.

**Fix:** Replace the cron trigger with an HTTP-triggered endpoint + external scheduler. Two options:
- **Option A (recommended):** Create `functions/api/cron-recurring-reminders.js` as a normal Pages Function (`onRequestGet`), protected by a secret API key. Trigger it via an external cron service (cron-job.org, GitHub Actions, or Cloudflare Worker scheduled trigger that fetches the endpoint). Zero new infrastructure — reuses the existing Pages Functions pattern.
- **Option B:** Create a separate Cloudflare Worker (not Pages Function) with `scheduled()` handler in a new `wrangler.cron.toml`. More moving parts but fully Cloudflare-native.

The amended plan uses Option A — it matches the existing codebase pattern and requires no new infrastructure.

#### B2: No service worker is registered — Web Push requires one

**Evidence:**
- `grep -rn "serviceWorker\|service-worker" src/ public/ index.html` → zero results
- `public/sw.js` and `public/service-worker.js` do not exist
- `manifest.json` exists (PWA-capable) but no SW is registered
- Web Push API requires an active service worker subscription (`navigator.serviceWorker.ready.pushManager.subscribe()`)
- The plan's R4.1 creates `pushSubscription.ts` with `navigator.serviceWorker.pushManager` calls — this will throw because no SW is registered

**Impact:** Phase 3 push subscription will fail at runtime. `pushManager.subscribe()` requires a service worker.

**Fix:** Add a minimal service worker registration step to the plan:
1. Create `public/sw.js` — a minimal SW that handles `push` events and `notificationclick` events (no caching needed for v1)
2. Register it in `App.tsx` on mount: `navigator.serviceWorker.register('/sw.js')`
3. `pushSubscription.ts` waits for `navigator.serviceWorker.ready` before subscribing

#### B3: `reminder_log` not added to `initialSync` — plan repeats existing `payment_chases` omission

**Evidence:**
- `src/lib/initialSync.ts` syncs 14 tables but does NOT include `payment_chases` (confirmed: `grep -c "payment_chases" src/lib/initialSync.ts` = 0)
- `payment_chases` IS in `sync.ts` `updateSyncStatus` and `hasSyncError` (lines 189-190, 202) — it syncs UP but not DOWN
- The plan's R4.5 adds `reminder_log` to `sync.ts` but does NOT mention adding it to `initialSync.ts`
- This means `reminder_log` entries created by the server would never appear on a fresh device login

**Impact:** Merchant installs Buildlogg on a new phone → no reminder history visible. The `reminder_log` table in Supabase has entries, but `initialSync` never fetches them.

**Fix:** Add `reminder_log` to `initialSync.ts`. Also fix the pre-existing `payment_chases` omission while we're here (add both to `initialSync`).

### GAPS

#### G1: Customer `email` field exists but plan doesn't verify it's populated

**Evidence:** `Customer.email` is optional (`email?: string` in db.ts line 61). `CustomerDetail.tsx` displays it if present. But the recurring job creation flow (`createRecurringJob` in `recurringJobs.ts`) doesn't snapshot the email — it only stores `customer_id`.

The plan's §4.1 adds `client_email` to `RecurringJob` but doesn't specify when it gets populated. The cron worker needs the email at processing time, but if the customer's email changes between job creation and reminder time, the snapshot is stale.

**Fix:** Don't snapshot email on `RecurringJob`. Instead, the cron worker fetches the customer's current email at processing time via the `customer_id` join. The `client_email` field on `RecurringJob` is unnecessary — remove it. The cron queries `recurring_jobs` JOIN `customers` to get the email.

#### G2: No rollback / migration safety for Dexie v10

**Evidence:** The plan adds `this.version(10).stores({ reminder_log: '...' })` but doesn't handle existing users who have data at v9. Dexie migrations are forward-only — adding a new table in a new version is safe (existing tables are preserved), but the plan should explicitly state this.

**Fix:** Add a note that Dexie v10 only adds the `reminder_log` table — no existing table schema changes. Existing users auto-migrate on next app open. No data migration needed.

However, the `RecurringJob` interface gets 6 new optional fields. Dexie doesn't enforce schemas — existing records will have `undefined` for these fields. The code must handle `undefined` with defaults:
- `reminder_mode` → default to `'remind_me'`
- `reminder_count` → default to `0`
- Others → `undefined` is fine (optional fields)

#### G3: Resend `from` domain mismatch — app Supabase vs outreach Supabase

**Evidence:**
- The Buildlogg app uses Supabase at `VITE_SUPABASE_URL` (app's project)
- The outreach/cold-email system uses a DIFFERENT Supabase (`OUTREACH_SUPABASE_URL` in `functions/api/resend-webhook.js` and `functions/unsubscribe.js`)
- The plan's cron worker queries `recurring_jobs` from the APP's Supabase but sends email via Resend using `RESEND_API_KEY`
- The `RESEND_API_KEY` in `.env` is the same key used for cold outreach (`re_NEN...PnJ4`)
- Resend sends from `team@mail.buildlogg.com` (verified domain)
- The plan doesn't specify the `from` address for reminder emails

**Fix:** Specify the `from` address in the cron worker: `Buildlogg <noreply@mail.buildlogg.com>`. This is the same domain used by `feedback-notify.js`. The reply-to should be the merchant's email if available, or omitted.

Also: the cron worker uses the APP's `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (same as `create-checkout-session.js` and `stripe-webhook.js`), NOT the outreach Supabase. The plan should state this explicitly.

#### G4: No auth/permission on the cron endpoint

**Evidence:** If we use Option A (HTTP-triggered Pages Function), the endpoint is public. Anyone who discovers `https://buildlogg.com/api/cron-recurring-reminders` could trigger it repeatedly, sending spam emails to clients.

**Fix:** The endpoint requires a `CRON_SECRET` env var. Requests must include `Authorization: Bearer <CRON_SECRET>` header. The worker rejects with 401 if missing or mismatched. This matches the pattern used by many serverless cron setups.

#### G5: Plan doesn't handle `advanceRecurrence` resetting `reminder_count`

**Evidence:** The existing `advanceRecurrence` in `recurringJobs.ts` (line 130) resets `contact_attempts` to 0 but the plan adds `reminder_count` as a new field. `advanceRecurrence` must also reset `reminder_count` and `last_reminder_sent_at`.

**Fix:** Update `advanceRecurrence` to also reset `reminder_count = 0`, `last_reminder_sent_at = null`, `last_reminder_status = null`.

### IMPROVEMENTS

#### I1: Plan says `functions/api/send-reminder-email.js` and `send-push-notification.js` as separate files — should be inline

**Evidence:** Existing Functions (`create-checkout-session.js`, `stripe-webhook.js`, `feedback-notify.js`) are self-contained single files. They don't import from each other. Cloudflare Pages Functions are independent — they can't import from sibling files without a bundler.

**Fix:** Inline the email-send and push-send logic directly into `cron-recurring-reminders.js`. The existing `feedback-notify.js` shows the pattern: `fetch('https://api.resend.com/emails', { ... })` directly. No separate files.

#### I2: Plan references `web-push` npm package — Cloudflare Workers/Pages can't use Node.js npm packages directly

**Evidence:** Existing Functions use raw `fetch()` calls, not npm packages. `stripe-webhook.js` verifies Stripe signatures using Web Crypto API, not the Stripe SDK. The `compatibility_flags = ["nodejs_compat"]` helps but `web-push` requires Node `crypto` module internals.

**Fix:** Implement Web Push using raw `fetch()` to the push subscription endpoint with the proper VAPID JWT header. This is ~40 lines of code using Web Crypto API for HMAC + ECDSA. Alternatively, use the `web-push` package via a bundler (esbuild) in the Functions build step — but this adds complexity. Raw fetch is simpler and matches the codebase pattern.

#### I3: Template placeholder `{bookingLink}` needs the Profile, but `fillTemplate` signature already receives it

**Evidence:** `fillTemplate(body, job, customer, profile, total)` in `templateEngine.ts` — the `profile` parameter is already available. The plan's R1.8 correctly adds `'{bookingLink}': (_, __, p) => ...` using the profile. This works. But the cron worker also needs to fill templates server-side, where it doesn't have access to `templateEngine.ts` (it's a Pages Function, not app code).

**Fix:** The cron worker must inline the template filling logic. It queries the `message_templates` table from Supabase, gets the template body, and does string replacement server-side. The placeholder functions are simple enough to duplicate (firstName from customer name, bookingLink from profile.slug). Document this as a deliberate duplication with a drift guard comment (same pattern as the booking Function's referral sources).

#### I4: Plan should sequence Phase 2 before Phase 3, but Phase 1 UI should be built first to populate the `reminder_mode` field

**Evidence:** The cron worker (Phase 2) reads `reminder_mode` from `recurring_jobs`. If Phase 1 isn't built first, all existing recurring jobs have `reminder_mode = undefined` → the cron defaults to `'remind_me'`. This is fine (safe default), but the Settings UI should ship first so merchants can configure the mode before the cron starts sending.

**Fix:** The plan already sequences Phase 1 → Phase 2 → Phase 3. This is correct. Just make it explicit that Phase 1 must be deployed before Phase 2's cron is enabled.

---

## 3. AMENDED PLAN

The full amended plan follows. Changes from the original are marked with **[FIXED:** and the blocker/gap/improvement ID**]**.

---

# W3-1: Smart Reminders & Auto-Messaging — Amended Implementation Plan

> **Date:** 2026-06-27 (amended after codebase audit)
> **Feature:** W3-1 from FUTURE.md
> **Builds on:** P2-02 (Recurring Jobs), P2-08 (Message Templates), BN-1 (Notifications)
> **Status:** Ready for implementation
> **Estimated build time:** 3 commits

---

## 1. Problem Statement

### Sophie (beauty)
Every 4 weeks Sophie texts 20 regular clients: "Time for your refill — want me to book you in?" She types each one manually, forgets half, and loses clients to whoever they find on Instagram when the nail grows out. The recurring engine (P2-02) already creates `recurring_jobs` records with `next_due_at`, but the activation layer — actually reaching out to the client — is entirely manual.

### Dave (trades)
Dave services 12 boilers annually. He forgets to remind customers 2 weeks before. They forget to call him. He loses £480+/year in repeat business. The recurring task card appears on Home when he opens the app, but if he doesn't open the app that day, the reminder is invisible.

### Current gap
- `recurring_jobs` records exist with `next_due_at` and `reminder_lead_days`
- Task cards appear on Home **only when the app is open**
- No server-side trigger — nothing happens if the app is closed
- No auto-messaging — merchant must manually tap "Send WhatsApp" per client
- No way to distinguish "remind me to call" from "auto-message the client"
- No reminder history — can't tell if a reminder was already sent this cycle

---

## 2. Architecture Decision: What "Auto" Means

### What's NOT possible (deferred in PRD)
- **WhatsApp Business API** — expensive, Meta approval, ToS restrictions. Explicitly deferred.
- **`wa.me` auto-send** — deep links require user interaction (tap → opens WhatsApp). Cannot be triggered server-side.

### What IS possible (this build)

| Channel | Mechanism | Cost | Auto-send? |
|---------|-----------|------|------------|
| **Push notification to merchant** | Web Push API via HTTP-triggered endpoint → merchant taps → opens app | Free | ✅ Server-side |
| **Email to client** | Resend API via HTTP-triggered endpoint | Free tier (566 remaining) | ✅ Server-side |
| **SMS to client** | Twilio API via HTTP-triggered endpoint | ~£0.035/message | ✅ Server-side (future) |
| **WhatsApp to client** | `wa.me` deep link from task card | Free | ❌ Manual (merchant taps) |

**[FIXED: B1]** Server-side activation uses an HTTP-triggered Cloudflare Pages Function (not a cron-triggered Worker). The endpoint is called by an external scheduler (cron-job.org, GitHub Actions scheduled workflow, or a separate Cloudflare Worker with `scheduled()` handler). This matches the existing Pages Functions pattern (`onRequestGet` / `onRequestPost`).

### Decision: Three reminder modes

The recurring job record gets a `reminder_mode` field:

| Mode | What happens | Channel | Who acts |
|------|-------------|---------|----------|
| `remind_me` | Push notification to merchant + task card on Home | Web Push | Merchant opens app, taps card, sends WhatsApp manually |
| `remind_client` | Auto message sent to client (email via Resend, SMS via Twilio if configured) | Email/SMS | Server sends, merchant sees log entry |
| `both` | Push notification to merchant AND auto message to client | Push + Email/SMS | Server sends to client + notifies merchant |

**Default:** `remind_me` (safest — no client-facing messages without explicit opt-in).

---

## 3. Use Cases

### UC-1: Sophie — 4-weekly nail refills (remind_client mode)
Sophie has 15 recurring clients on monthly cycle. She sets `reminder_mode = 'remind_client'` and picks email as the channel. On the 2-weeks-before mark, the server endpoint fires, reads each due `recurring_jobs` record, fills the `recurring_reminder` template with client data, and sends an email: "Hi Emma, your nail refill is due in 2 weeks. Book your slot: buildlogg.com/book/sophie-nails". Sophie sees a work log entry on each recurring job: "Auto-reminder sent via email to Emma Walsh".

### UC-2: Dave — Annual boiler service (remind_me mode)
Dave has 12 annual boiler service reminders. He sets `reminder_mode = 'remind_me'`. Two weeks before each is due, the endpoint sends a push notification: "Boiler service due — Sarah Mitchell, 12 High St". Dave opens the app, sees the task card, taps "Send WhatsApp" → pre-filled message goes to Sarah. He taps "Mark as done" after she books.

### UC-3: Sophie — New client, no email on file (remind_client fallback)
Sophie has `reminder_mode = 'remind_client'` but a recurring client (Lisa) has no email address. The endpoint checks: no email → falls back to `remind_me` for that client only → sends push notification to Sophie: "Lisa's refill is due — no email on file, send WhatsApp manually". Sophie taps the card and sends via WhatsApp.

### UC-4: Dave — Client doesn't respond after 3 reminders
Dave has `reminder_mode = 'both'`. The endpoint sends an email to the client + a push to Dave. Client doesn't respond. After 3 reminder cycles (3 × `reminder_lead_days` before each `next_due_at`), the recurring job auto-moves to `dormant` status. Dave sees a task card: "Sarah Mitchell — boiler service: 3 reminders sent, no response. Mark as done, reactivate, or cancel?"

### UC-5: Sophie — Client replies and books (cycle advance)
Sophie's client Emma replies to the auto-email and books via the booking page. Sophie accepts the booking request in the app. The recurring job is advanced to the next cycle (`advanceRecurrence`). The `reminder_count` resets to 0.

### UC-6: Dave — Cancels a recurring job
Dave's customer moved house. He opens the recurring job, taps "Cancel recurrence" → "Why?" → "Customer moved". The recurring job status changes to `cancelled`. The endpoint stops sending reminders for this job.

### UC-7: Sophie — Edits reminder timing
Sophie wants reminders 1 week before instead of 2. She opens the recurring job, changes `reminder_lead_days` from 14 to 7. The next endpoint run picks up the new value.

### UC-8: Dave — Offline when push notification fires
Dave's phone is off when the endpoint sends the push notification at 9am. Web Push API queues the notification. When Dave opens his phone, the notification appears. He taps it → opens Buildlogg → sees the task card.

### UC-9: Sophie — Auto-email bounces
The endpoint sends an email to Sophie's client. Resend returns a bounced event. The endpoint records `last_reminder_status = 'bounced'` on the recurring job. Next cycle, the endpoint skips email for this client and falls back to `remind_me` (push to Sophie).

### UC-10: Dave — Multiple recurring jobs due on the same day
Dave has 3 boiler services all due the same week. The endpoint sends 3 separate push notifications (one per job) with a 5-minute gap between each to avoid notification fatigue. Alternatively, if 3+ are due on the same day, the endpoint sends a single batch notification: "3 recurring jobs due this week — tap to review".

### UC-11: Sophie — Changes mode from remind_me to remind_client
Sophie has been using `remind_me` for 2 months. She decides to switch to `remind_client` to save time. She changes the mode on her profile or per-recurring-job. The next endpoint run picks up the new mode and starts auto-sending emails.

### UC-12: Dave — Recurring job with suggested_month
Dave's boiler service is seasonal — always in October. The `suggested_month = 10`. The endpoint calculates the next reminder as October 1st minus `reminder_lead_days` (14) = September 17th. It fires on that date regardless of when the last job was completed.

---

## 4. Data Model Changes

### 4.1 RecurringJob interface additions

**[FIXED: G1]** Removed `client_email` and `client_phone` snapshot fields — the server fetches current customer data at processing time via `customer_id` join.

```ts
export type ReminderMode = 'remind_me' | 'remind_client' | 'both';

export interface RecurringJob {
  // ... existing fields ...

  // W3-1: Smart reminder fields
  reminder_mode: ReminderMode;          // default: 'remind_me' — handled in code as undefined → 'remind_me'
  reminder_channel?: 'email' | 'sms';   // for remind_client mode; null = use merchant default
  last_reminder_sent_at?: string;       // ISO timestamp of last auto-reminder
  last_reminder_status?: 'sent' | 'failed' | 'bounced';
  reminder_count: number;               // total reminders sent this cycle (resets on advanceRecurrence)
}
```

**[FIXED: G2]** Existing `RecurringJob` records (created before this feature) will have `undefined` for these fields. All code that reads them must apply defaults:
- `reminder_mode` → `undefined` treated as `'remind_me'`
- `reminder_count` → `undefined` treated as `0`
- `last_reminder_sent_at` / `last_reminder_status` → `undefined` treated as "never sent"

No Dexie data migration is needed — Dexie is schemaless for field additions. The v10 version only adds the new `reminder_log` table.

### 4.2 Profile interface additions

```ts
export interface Profile {
  // ... existing fields ...

  // W3-1: Merchant-level reminder defaults
  default_reminder_mode?: ReminderMode;       // default: 'remind_me'
  default_reminder_channel?: 'email' | 'sms'; // default: 'email'
  push_subscription_endpoint?: string;
  push_subscription_keys?: { p256dh: string; auth: string };
}
```

### 4.3 New Dexie table: `reminder_log`

**[FIXED: G2]** Dexie v10 adds only this new table. No existing table schemas change. Auto-migrates on next app open.

```ts
export interface ReminderLog {
  id: string;
  recurring_job_id: string;
  user_id: string;
  channel: 'push' | 'email' | 'sms';
  recipient: string;          // email address, phone number, or 'merchant'
  status: 'sent' | 'failed' | 'bounced' | 'delivered';
  message_preview: string;    // first 200 chars of the message
  provider_id?: string;       // Resend email ID, or push receipt
  error_message?: string;
  sent_at: string;
  _sync_status: SyncStatus;
}
```

**Dexie v10 schema:**
```ts
this.version(10).stores({
  reminder_log: 'id, recurring_job_id, user_id, channel, sent_at, _sync_status',
});
```

### 4.4 Supabase migration

**[FIXED: G3]** Cron worker uses the APP's Supabase (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), same as `create-checkout-session.js` and `stripe-webhook.js`. NOT the outreach Supabase.

```sql
-- W3-1: Smart Reminders

-- Add reminder fields to recurring_jobs
ALTER TABLE recurring_jobs
  ADD COLUMN IF NOT EXISTS reminder_mode text NOT NULL DEFAULT 'remind_me',
  ADD COLUMN IF NOT EXISTS reminder_channel text,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_status text,
  ADD COLUMN IF NOT EXISTS reminder_count int NOT NULL DEFAULT 0;

-- Add push subscription + reminder defaults to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS default_reminder_mode text NOT NULL DEFAULT 'remind_me',
  ADD COLUMN IF NOT EXISTS default_reminder_channel text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS push_subscription_endpoint text,
  ADD COLUMN IF NOT EXISTS push_subscription_keys jsonb;

-- Reminder log table (server-side — cron writes here directly)
CREATE TABLE IF NOT EXISTS reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_job_id uuid NOT NULL REFERENCES recurring_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  channel text NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  message_preview text,
  provider_id text,
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  _sync_status text NOT NULL DEFAULT 'synced'
);
CREATE INDEX idx_reminder_log_recurring ON reminder_log(recurring_job_id);
CREATE INDEX idx_reminder_log_user ON reminder_log(user_id);
CREATE INDEX idx_reminder_log_sent ON reminder_log(sent_at);
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY reminder_log_owner ON reminder_log USING (auth.uid() = user_id);
```

### 4.5 New TemplateCategory

```ts
export type TemplateCategory =
  | 'booking' | 'reminder' | 'invoice' | 'follow_up'
  | 'review' | 'receipt' | 'update' | 'custom'
  | 'recurring_reminder';
```

**Default seed template:**
```ts
{
  category: 'recurring_reminder',
  name: 'Recurring appointment reminder',
  body: 'Hi {firstName}, your {jobTitle} is due soon. Book your slot here: {bookingLink}',
  is_default: true,
  sort_order: 7,
}
```

New placeholder: `{bookingLink}` → resolves to `bookingPageUrl(profile.booking_slug)` or falls back to `https://buildlogg.com`.

### 4.6 WorkLogType additions

```ts
export type WorkLogType =
  | 'note' | 'charge' | 'status_change' | 'customer_notified'
  | 'running_late' | 'quote_sent'
  | 'expense'
  | 'quote_follow_up_sent' | 'quote_follow_up_snoozed' | 'quote_follow_up_responded'
  | 'recurring_reminder_sent' | 'recurring_reminder_no_response'
  | 'payment_chase_sent' | 'payment_chase_paused' | 'payment_chase_resumed'
  | 'recurring_job_created' | 'recurring_job_cancelled'
  // W3-1:
  | 'auto_reminder_sent' | 'auto_reminder_failed' | 'auto_reminder_bounced'
  | 'recurring_dormant_auto';
```

---

## 5. Implementation Plan

### Phase 1: Client-side UI + reminder mode configuration (Commit 1)

**Must deploy before Phase 2 cron is enabled — merchants need to configure `reminder_mode` before the server starts sending.**

**Files:**
- `src/lib/db.ts` — add `ReminderMode` type, new fields on `RecurringJob` and `Profile`, new `ReminderLog` interface, Dexie v10 schema, `recurring_reminder` template category, 4 new `WorkLogType` values
- `src/lib/seedMessageTemplates.ts` — add `recurring_reminder` default template + `{bookingLink}` placeholder
- `src/lib/templateEngine.ts` — add `{bookingLink}` placeholder (resolves from profile)
- `src/screens/Home/index.tsx` — extend recurring task card BottomSheet (`sheet === 'recurring_actions'`) to show reminder mode + last reminder status + "Change mode" option
- `src/screens/Settings/Reminders.tsx` (NEW) — merchant-level defaults screen: default reminder mode, default channel, push notification toggle
- `src/screens/Settings/index.tsx` — add "Smart reminders" nav row in a new "Automation" section
- `src/App.tsx` — add route for `/settings/reminders`
- `src/lib/recurringJobs.ts` — add `setReminderMode(id, mode)`, `updateReminderLeadDays(id, days)`, `getReminderHistory(id)` functions. **[FIXED: G5]** Update `advanceRecurrence` to also reset `reminder_count = 0`, `last_reminder_sent_at = null`, `last_reminder_status = null`.
- `src/lib/analytics.ts` — add reminder analytics events

**What it does:**
- Merchant can set default reminder mode (remind_me / remind_client / both) in Settings
- Merchant can override mode per recurring job from the task card BottomSheet
- Merchant can edit reminder lead days per recurring job
- The `recurring_reminder` template is seeded for existing users via `seedMissingTemplates`
- Reminder log entries appear in the work log when sync pulls them down

**Acceptance criteria:**
- [ ] Settings → "Smart reminders" screen shows mode toggle (3 options) + channel select (email/sms)
- [ ] Recurring task card BottomSheet shows current mode + "Change mode" option
- [ ] Changing mode on a recurring job persists to Dexie + sync queue
- [ ] Changing default mode in Settings persists to Dexie + sync queue
- [ ] `recurring_reminder` template seeded for existing users on next login
- [ ] `{bookingLink}` placeholder resolves correctly in template preview
- [ ] `advanceRecurrence` resets `reminder_count`, `last_reminder_sent_at`, `last_reminder_status`
- [ ] Code reads `reminder_mode` with `undefined` → `'remind_me'` default
- [ ] Code reads `reminder_count` with `undefined` → `0` default
- [ ] Build passes: `tsc && vite build`
- [ ] Lint passes: `npm run lint`

### Phase 2: Server-side reminder endpoint (Commit 2)

**[FIXED: B1]** Uses HTTP-triggered Cloudflare Pages Function, not cron-triggered Worker. External scheduler calls the endpoint daily.

**[FIXED: G3]** Uses APP's Supabase, not outreach Supabase. Sends email from `noreply@mail.buildlogg.com` (same domain as `feedback-notify.js`).

**[FIXED: G4]** Endpoint requires `CRON_SECRET` authorization header.

**[FIXED: I1]** Single self-contained file — no imports from sibling Functions. Email-send and push-send logic inlined.

**[FIXED: I2]** Web Push implemented with raw `fetch()` + Web Crypto API, not `web-push` npm package.

**[FIXED: I3]** Template filling inlined server-side with drift guard comment referencing `templateEngine.ts`.

**Files:**
- `functions/api/cron-recurring-reminders.js` (NEW) — self-contained Pages Function
- `supabase/migrations/20260628000003_smart_reminders.sql` (NEW) — migration from §4.4
- `.env.example` — document new env vars

**Endpoint logic (`functions/api/cron-recurring-reminders.js`):**

```
GET /api/cron-recurring-reminders
Headers: Authorization: Bearer <CRON_SECRET>

1. Verify Authorization header matches CRON_SECRET env var. 401 if not.

2. Query APP's Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
   SELECT * FROM recurring_jobs
   WHERE status = 'active'
   AND next_due_at <= NOW() + (reminder_lead_days || ' days')::interval
   AND (last_reminder_sent_at IS NULL
        OR last_reminder_sent_at < (next_due_at - (reminder_lead_days || ' days')::interval))
   AND reminder_count < 3
   LIMIT 50

3. For each due recurring job:
   a. Fetch merchant profile from Supabase (default_reminder_mode, default_reminder_channel,
      push_subscription_endpoint, push_subscription_keys, booking_slug, business_name)
   b. Fetch customer from Supabase by customer_id (name, phone, email)
   c. Fetch message template from Supabase:
      SELECT * FROM message_templates WHERE user_id = ? AND category = 'recurring_reminder'
      AND is_default = true LIMIT 1
   d. Fill template: replace {firstName}, {jobTitle}, {bookingLink} server-side
      - {firstName}: customer.name.split(' ')[0]
      - {jobTitle}: recurring_job.title
      - {bookingLink}: booking_slug ? `https://buildlogg.com/book/${booking_slug}` : 'https://buildlogg.com'
   e. Determine effective mode: job.reminder_mode || profile.default_reminder_mode || 'remind_me'
   f. If mode = 'remind_me' or 'both':
      - If profile.push_subscription_endpoint exists:
        - Send Web Push via raw fetch() to subscription endpoint with VAPID JWT
        - Insert reminder_log (channel='push', recipient='merchant', status='sent'|'failed')
      - Else: log "no push subscription", skip
   g. If mode = 'remind_client' or 'both':
      - If customer.email exists and last_reminder_status != 'bounced':
        - Send email via Resend API (fetch to https://api.resend.com/emails)
        - From: 'Buildlogg <noreply@mail.buildlogg.com>'
        - Insert reminder_log (channel='email', recipient=email, status='sent'|'failed')
      - If no email: fall back to push to merchant + log "no client email"
      - If last_reminder_status == 'bounced': skip email, fall back to push
   h. Update recurring_jobs in Supabase:
      - last_reminder_sent_at = NOW()
      - last_reminder_status = 'sent' | 'failed' | 'bounced'
      - reminder_count = reminder_count + 1
   i. Insert work_log entry (via Supabase REST API) for the original_job_id

4. Batch push notifications: if 3+ jobs due for same merchant on same run,
   send a single batch push: "N recurring jobs due this week" instead of N pushes.

5. Auto-dormant check: if reminder_count >= 3 AND status = 'active',
   set status = 'dormant'. Insert work_log 'recurring_dormant_auto'.

6. Return JSON: { processed: N, sent: M, failed: F, dormant: D }
```

**Web Push implementation (raw fetch + Web Crypto API):**
~40 lines. Creates VAPID JWT with ES256 signature using the private key. Sends to the push subscription endpoint with the JWT as `Authorization: WebPush <jwt>` header. Payload is AES128GCM-encrypted (or for v1, unencrypted with `Content-Encoding: aes128gcm` — though Chrome now requires encryption).

Simpler alternative for v1: use the `web-push` npm package via esbuild bundling in the Functions build step. Add to `package.json` devDependencies and configure Cloudflare Pages build command to bundle Functions. This is more reliable than hand-rolling Web Push encryption.

**External scheduler setup:**
- **Option A (simplest):** Create a free cron-job.org account, set URL to `https://buildlogg.com/api/cron-recurring-reminders`, set header `Authorization: Bearer <CRON_SECRET>`, schedule daily at 09:00 BST.
- **Option B:** GitHub Actions scheduled workflow with `curl` to the endpoint.
- **Option C:** Separate Cloudflare Worker with `[triggers] crons = ["0 8 * * *"]` that fetches the endpoint. Requires a second `wrangler.toml`.

Document all three options in the Function file header. Recommend Option A for simplicity.

**Environment variables (Cloudflare Pages dashboard):**
```
SUPABASE_URL              — app's Supabase project URL (already set)
SUPABASE_SERVICE_ROLE_KEY — already set (used by stripe-webhook.js)
RESEND_API_KEY            — already set (used by feedback-notify.js)
CRON_SECRET               — NEW: random string for endpoint auth
VAPID_PUBLIC_KEY          — NEW: Web Push VAPID public key
VAPID_PRIVATE_KEY         — NEW: Web Push VAPID private key
```

**Acceptance criteria:**
- [ ] Migration applied to Supabase (new columns + reminder_log table)
- [ ] Endpoint returns 401 without valid `CRON_SECRET`
- [ ] Endpoint returns 200 with `{ processed, sent, failed, dormant }` JSON
- [ ] Recurring jobs due within `reminder_lead_days` get processed
- [ ] `remind_me` mode → push notification sent to merchant (if subscribed)
- [ ] `remind_client` mode → email sent via Resend (if customer has email)
- [ ] `both` mode → push + email sent
- [ ] No customer email → falls back to push to merchant
- [ ] `last_reminder_status = 'bounced'` → next run skips email, sends push
- [ ] 3+ jobs due for same merchant → single batch push notification
- [ ] `reminder_count` increments after each send
- [ ] 3 reminders with no response → auto-dormant
- [ ] `reminder_log` table populated in Supabase
- [ ] `recurring_jobs` updated with `last_reminder_sent_at` + `last_reminder_status`
- [ ] Failed sends → `last_reminder_status = 'failed'`, retried next run
- [ ] Bounced emails → `last_reminder_status = 'bounced'`, next cycle falls back to push
- [ ] Max 50 jobs per run enforced (LIMIT 50 in SQL)
- [ ] Resend 429 → stop email sends, continue push sends, log skipped jobs

### Phase 3: Service worker + push subscription + reminder log UI (Commit 3)

**[FIXED: B2]** Creates and registers a service worker — required for Web Push.

**Files:**
- `public/sw.js` (NEW) — minimal service worker: `push` event handler + `notificationclick` handler
- `src/App.tsx` — register service worker on mount: `navigator.serviceWorker.register('/sw.js')`
- `src/lib/pushSubscription.ts` (NEW) — Web Push subscription manager
- `src/screens/Settings/Reminders.tsx` — add push notification toggle + permission flow
- `src/components/ReminderHistory/index.tsx` (NEW) — shows reminder log for a recurring job
- `src/screens/Home/index.tsx` — recurring task card shows last reminder status badge
- `src/lib/sync.ts` — add `reminder_log` to `updateSyncStatus` switch + `hasSyncError` tables
- **[FIXED: B3]** `src/lib/initialSync.ts` — add `reminder_log` sync AND fix pre-existing `payment_chases` omission
- `src/lib/realtime.ts` — subscribe to `reminder_log` changes for live updates
- `src/lib/analytics.ts` — add push subscription events

**Service worker (`public/sw.js`):**
```js
// Minimal SW for Web Push — no caching in v1
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Buildlogg';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: data.url ? { url: data.url } : {},
    tag: data.tag || 'buildlogg-reminder',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app';
  event.waitUntil(clients.matchAll({ type: 'window' }).then((clientList) => {
    for (const client of clientList) {
      if (client.url.includes(url) && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
```

**Push subscription flow:**
1. Merchant goes to Settings → Smart reminders → toggles "Push notifications"
2. Browser shows native permission prompt (leveraging BN-1's `notificationManager.ts` contextual pattern)
3. On grant → `navigator.serviceWorker.ready.then(reg => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY }))`
4. Subscription saved to `profiles.push_subscription_*` via `updateProfile` + sync queue
5. On revoke → `subscription.unsubscribe()` + clear profile fields

**`pushSubscription.ts`:**
```ts
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function subscribePush(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  return sub;
}

export async function unsubscribePush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) return await sub.unsubscribe();
  return false;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return await reg.pushManager.getSubscription();
}
```

**Reminder history UI:**
- On recurring task card BottomSheet → "Reminder history" expandable section
- Shows last 5 reminders: channel icon (bell/mail/message), date, status badge (sent/failed/bounced)
- Pulled from `reminder_log` table (synced from Supabase via `initialSync` + `realtime`)

**Task card enhancement:**
- If `last_reminder_sent_at` exists → show "Reminder sent Nd ago" badge
- If `last_reminder_status = 'bounced'` → red "Email bounced" warning
- If `reminder_count >= 2` → amber "N reminders, no response" warning

**initialSync.ts changes:**
```ts
// Add after recurring_jobs sync:
await syncTable(
  supabase.from('payment_chases').select('*').eq('user_id', userId),
  db.payment_chases);

await syncTable(
  supabase.from('reminder_log').select('*').eq('user_id', userId),
  db.reminder_log);
```

**Acceptance criteria:**
- [ ] Service worker registered on app load (check DevTools → Application → Service Workers)
- [ ] `isPushSupported()` returns false on iOS Safari without Home Screen install
- [ ] `isPushSupported()` returns true on Chrome/Edge (desktop/Android)
- [ ] Toggling push in Settings → native permission prompt appears
- [ ] On grant → subscription saved to profile + syncs to Supabase
- [ ] On deny → toggle reverts, shows "Notifications blocked — enable in browser settings"
- [ ] Push notification received on device when cron endpoint fires (test with manual curl)
- [ ] Tapping push notification opens app
- [ ] Reminder history component renders last 5 entries
- [ ] Status badges: sent (green), failed (amber), bounced (red)
- [ ] `reminder_log` syncs from Supabase to Dexie via `initialSync` + `realtime`
- [ ] `payment_chases` now syncs via `initialSync` (pre-existing fix)
- [ ] Unsubscribing push → `subscription.unsubscribe()` + profile fields cleared
- [ ] Build passes: `tsc && vite build`

---

## 6. Edge Cases & Scenarios

### 6.1 Data & sync

| # | Scenario | Handling |
|---|----------|----------|
| E1 | Merchant has no push subscription and mode = `remind_me` | Endpoint skips push, logs `last_reminder_status = 'failed'` with error "no push subscription". Next app open shows the task card (existing behavior). |
| E2 | Customer email is empty string (not null) | Treat empty string same as null — skip email, fall back to push. Trim before checking. |
| E3 | Customer phone has non-UK format | SMS channel validates UK format (`+44` or `07`). Non-UK → skip SMS, log "invalid phone format". |
| E4 | Recurring job created on device A, endpoint runs on server | Endpoint reads from Supabase, not Dexie. The `recurring_jobs` table syncs up from Dexie → Supabase. As long as the job was synced before the endpoint fires, it's picked up. If not synced yet (offline) → missed this cycle, picked up next run. |
| E5 | Merchant changes reminder_mode while a reminder is in-flight | Endpoint reads mode at processing time. If merchant changes mode mid-run, the current reminder uses the old mode. Next run uses the new mode. No race condition. |
| E6 | `reminder_log` entry created by server, then recurring job is cancelled | `reminder_log` has `ON DELETE CASCADE` → entries deleted when recurring job is deleted. But if job is cancelled (not deleted), entries remain for audit. |
| E7 | Two devices push different `recurring_jobs.reminder_mode` values | Last-write-wins via `updated_at` (existing realtime conflict resolution in `realtime.ts`). The most recent change wins. |
| E8 | Endpoint runs but Supabase is unreachable | Function catches the error, returns 500 with error message. External scheduler retries next day. No data loss — recurring jobs are not modified on failure. |
| E9 | Resend API returns rate limit (429) | Endpoint backs off, skips remaining email sends for this run, logs `last_reminder_status = 'failed'`. Retries next run. |
| E10 | Push notification service (FCM/APNS) is down | Web Push retries internally. If still failed after 24h, subscription is considered expired. Next app open → re-subscribe. |
| E11 | **[NEW]** External scheduler (cron-job.org) is down | Reminders don't fire that day. No data corruption — the endpoint is stateless and idempotent. Next successful run picks up all due jobs. |
| E12 | **[NEW]** Endpoint is called multiple times in one day | The SQL query checks `last_reminder_sent_at < (next_due_at - lead_days interval)`. If already sent today, the job won't be selected again. Idempotent. |
| E13 | **[NEW]** Existing recurring jobs have `reminder_mode = null` (pre-migration) | SQL `DEFAULT 'remind_me'` handles new rows. For existing rows, the ALTER TABLE sets the default. Code also treats `undefined`/`null` as `'remind_me'`. |

### 6.2 User behavior

| # | Scenario | Handling |
|---|----------|----------|
| E14 | Merchant marks recurring job as "done" but forgets to advance recurrence | Existing `advanceRecurrence` is called when merchant taps "Mark as done" on the task card. If they dismiss the card without tapping, the recurrence stays active. Next endpoint run sends another reminder — but `reminder_count` is already > 0, so it may hit the dormant threshold faster. |
| E15 | Client responds to auto-email but merchant doesn't update app | The recurring job stays active. Next cycle, another reminder goes out. Merchant can tap "Mark as done" to advance. No way to auto-detect client response from email (no reply-to tracking in v1). |
| E16 | Merchant deletes the customer associated with a recurring job | Recurring job has `customer_id` but no cascade delete in Dexie. Customer deletion leaves orphaned `customer_id`. Endpoint catches the missing customer → skips, logs "customer not found". Task card shows "Unknown customer" — merchant can cancel the recurrence. |
| E17 | Merchant switches from `remind_client` back to `remind_me` | `reminder_count` does NOT reset (only resets on `advanceRecurrence`). If count was 2 under `remind_client` and they switch to `remind_me`, the next push reminder is count 3 → auto-dormant. This is correct behavior — 3 reminders total, regardless of channel. |
| E18 | Recurring job has `suggested_month` and the month has already passed this year | `calculateNextDue` already handles this: if the target month is in the past, it sets the date to next year. The endpoint uses `next_due_at` which is already correct. |
| E19 | Merchant has 50+ recurring jobs (high-volume salon) | Endpoint processes max 50 per run (SQL LIMIT 50). Runs daily, so 50/day capacity. Rate limit protects Resend free tier (max 100/day → process email jobs first, defer push-only jobs). |
| E20 | Merchant enables push notifications but then clears browser data | Push subscription becomes orphaned. Endpoint tries to send → push service returns 410 Gone → endpoint clears the subscription from `profiles.push_subscription_*`. Next app open → BN-1 banner re-prompts. |
| E21 | Client marks auto-email as spam | Resend reports a spam complaint via webhook. Endpoint doesn't handle this in real-time (no webhook for reminder emails in v1). Next run, the bounced status is checked via Resend API or the existing `resend-webhook.js` writes to `email_events`. For v1, check `last_reminder_status` — if the email ID is in `email_events` with `bounced` or `complained`, skip. **Simpler v1 approach:** just rely on `last_reminder_status` set by the endpoint's own Resend API response. Webhook integration is v2. |
| E22 | **[NEW]** Merchant's booking page is disabled (`booking_enabled = false`) | `{bookingLink}` still resolves to the URL, but the booking page will show "not found". The email contains a dead link. Fix: the endpoint checks `booking_enabled` before including the link. If disabled, replace with "Reply to this email to book" or omit the link. |

### 6.3 Template & message

| # | Scenario | Handling |
|---|----------|----------|
| E23 | Merchant has no `recurring_reminder` template (deleted it) | Endpoint falls back to hardcoded default: "Hi {firstName}, your {jobTitle} is due soon. Book your slot: {bookingLink}". Logs a warning. |
| E24 | Template references `{bookingLink}` but merchant has no booking slug | Placeholder resolves to `https://buildlogg.com` (homepage) as fallback. Not ideal but not broken. Endpoint logs "no booking slug — using homepage URL". |
| E25 | Template has unsupported placeholders like `{amount}` | Server-side fill only handles `{firstName}`, `{jobTitle}`, `{bookingLink}`. Other placeholders are left as-is (literally `{amount}` in the email). Not ideal but not broken. Document supported placeholders in the template editor. |
| E26 | Merchant customises the template with offensive content | No content moderation in v1. The template is the merchant's own — they're sending to their own clients. Liability rests with the merchant. |
| E27 | Email body is > 100KB (merchant wrote a novel) | Resend rejects payloads > 1MB. Truncate template body to 10,000 chars before sending. Log "template truncated". |
| E28 | **[NEW]** Server-side template fill diverges from client-side `templateEngine.ts` | Drift guard: the endpoint file has a comment block listing all supported placeholders, referencing `src/lib/templateEngine.ts`. Adding a new placeholder = update both files. Same pattern as `functions/book/[[slug]].js` referral sources. |

### 6.4 Platform & environment

| # | Scenario | Handling |
|---|----------|----------|
| E29 | iOS Safari doesn't support Web Push | iOS 16.4+ supports Web Push when app is added to Home Screen. If not supported, `isPushSupported()` returns false → Settings shows "Push notifications require iOS 16.4+ and adding Buildlogg to your Home Screen." Fall back to task card only. |
| E30 | Merchant uses Buildlogg in browser (not installed as PWA) | Push notifications work in Chrome/Edge/Firefox on desktop and Android. On iOS Safari without Home Screen install → no push. Task cards still work when app is open. |
| E31 | Endpoint runs but Supabase migration hasn't been applied | Endpoint queries `recurring_jobs` → gets error on new columns → catches → returns 500 with error message. No crash. Migration must be applied before enabling the endpoint. |
| E32 | Endpoint env variables not set (RESEND_API_KEY missing) | Endpoint checks env at start. If missing → logs "RESEND_API_KEY not configured" → skips email sends, still does push if VAPID keys are set. Partial degradation, not a crash. |
| E33 | External scheduler is delayed (platform issue) | cron-job.org doesn't guarantee exact timing. If delayed by hours, reminders go out late. Not critical — recurring reminders are not time-critical to the minute. |
| E34 | **[NEW]** Service worker fails to register (e.g., served from wrong scope) | `navigator.serviceWorker.register('/sw.js')` catches the error. App still works — push is just unavailable. Log the error. Settings shows "Push unavailable — try reloading the page." |
| E35 | **[NEW]** Service worker is cached and doesn't update after deploy | SW update happens via `navigator.serviceWorker.register('/sw.js')` on each app load — the browser checks for byte differences. If the SW file changes, the new one installs and activates on next navigation. No manual cache-busting needed for v1. |

---

## 7. Scenarios (end-to-end flows)

### Scenario A: Sophie sets up auto-email reminders for the first time

1. Sophie opens Settings → Smart reminders
2. She sees three options: "Remind me", "Remind client", "Both"
3. She picks "Remind client" → channel select appears → "Email"
4. She enables push notifications (for fallback cases) → browser prompts → she allows → SW subscribes
5. She taps "Save"
6. Her profile updates: `default_reminder_mode = 'remind_client'`, `default_reminder_channel = 'email'`
7. She goes to Home → sees existing recurring task cards
8. She taps a card → BottomSheet → sees "Mode: Remind client (email)" → "Change" → confirms
9. The recurring job updates: `reminder_mode = 'remind_client'`
10. Two weeks before the next due date, the external scheduler calls the endpoint
11. Endpoint reads Sophie's profile + the recurring job + the customer
12. Endpoint fills the `recurring_reminder` template: "Hi Emma, your Nail refill is due soon. Book your slot here: buildlogg.com/book/sophie-nails"
13. Endpoint sends via Resend → success → inserts `reminder_log` → updates `recurring_jobs.last_reminder_sent_at`
14. Sophie opens the app → `initialSync` pulls `reminder_log` → sees "Reminder sent 2d ago" on the task card
15. Emma clicks the booking link → books → Sophie accepts → `advanceRecurrence` fires → `reminder_count` resets

### Scenario B: Dave gets a push notification for a boiler service

1. Dave has `reminder_mode = 'remind_me'` (default)
2. He enabled push notifications in Settings → SW registered → subscription saved
3. His recurring job: "Boiler service" for Sarah Mitchell, annual, next due Jul 15
4. `reminder_lead_days = 14` → endpoint fires on Jul 1
5. Endpoint reads Dave's profile + recurring job + customer
6. Mode is `remind_me` → endpoint sends push notification via Web Push to the subscription endpoint
7. Dave's phone shows the notification (he's at a job site)
8. He taps it → SW `notificationclick` handler → opens Buildlogg → recurring task card is on Home
9. He taps "Send WhatsApp" → `wa.me` opens with pre-filled message
10. Sarah replies "Yes, book me in" → Dave taps "Mark as done" → `advanceRecurrence`

### Scenario C: Auto-email bounces → fallback → dormant

1. Sophie has `reminder_mode = 'remind_client'` for Lisa's recurring job
2. Lisa's email address has a typo (`lisa@gmaill.com`)
3. Endpoint fires → sends email via Resend → Resend returns bounce event
4. Endpoint sets `last_reminder_status = 'bounced'` on the recurring job
5. Endpoint inserts `reminder_log` with `status = 'bounced'`
6. Next cycle (4 weeks later), endpoint fires again
7. Endpoint checks: `last_reminder_status = 'bounced'` → skip email for this client
8. Falls back to push notification to Sophie: "Lisa's refill is due — last email bounced. Send WhatsApp manually."
9. Sophie sees the card → "Email bounced" warning → she taps "Send WhatsApp" instead
10. If Sophie doesn't act and 3 total reminders have been sent → auto-dormant
11. Task card: "Lisa — nail refill: 3 reminders sent, no response. Reactivate or cancel?"

### Scenario D: Batch notification for multiple due jobs

1. Dave has 5 boiler services all due the same week (he did them all last July)
2. Endpoint fires on Jul 1 → queries 5 active recurring jobs due within 14 days
3. Count = 5 ≥ 3 → batch mode
4. Single push notification: "Buildlogg — 5 recurring jobs due this week. Tap to review."
5. Dave taps → app opens → Home shows 5 recurring task cards sorted by due date
6. Dave works through them one by one: call → book → mark done → advance recurrence

---

## 8. Requirements — Implementation Precision

### R1: Data model (Phase 1)

| # | Requirement | File | Precision |
|---|-------------|------|-----------|
| R1.1 | Add `ReminderMode` type to `db.ts` | `src/lib/db.ts` | `export type ReminderMode = 'remind_me' \| 'remind_client' \| 'both';` |
| R1.2 | Add 4 new fields to `RecurringJob` interface | `src/lib/db.ts` | `reminder_mode`, `reminder_channel`, `last_reminder_sent_at`, `last_reminder_status`, `reminder_count`. All optional except `reminder_count` (but code treats undefined as 0). |
| R1.3 | Add 4 new fields to `Profile` interface | `src/lib/db.ts` | `default_reminder_mode`, `default_reminder_channel`, `push_subscription_endpoint`, `push_subscription_keys` — all optional |
| R1.4 | Add `ReminderLog` interface | `src/lib/db.ts` | 10 fields: id, recurring_job_id, user_id, channel, recipient, status, message_preview, provider_id, error_message, sent_at |
| R1.5 | Add `reminder_log` table to Dexie v10 | `src/lib/db.ts` | `this.version(10).stores({ reminder_log: 'id, recurring_job_id, user_id, channel, sent_at, _sync_status' })` |
| R1.6 | Add `recurring_reminder` to `TemplateCategory` | `src/lib/db.ts` | Add to union type |
| R1.7 | Add 4 new `WorkLogType` values | `src/lib/db.ts` | `'auto_reminder_sent'`, `'auto_reminder_failed'`, `'auto_reminder_bounced'`, `'recurring_dormant_auto'` |
| R1.8 | Add `{bookingLink}` placeholder | `src/lib/templateEngine.ts` | `'{bookingLink}': (_, __, p) => p.booking_slug ? \`https://buildlogg.com/book/${p.booking_slug}\` : 'https://buildlogg.com'` |
| R1.9 | Seed `recurring_reminder` template | `src/lib/seedMessageTemplates.ts` | Add to `DEFAULT_TEMPLATES` array + handle in `seedMissingTemplates` + add to `deduplicateDefaults` categories list |

### R2: Client UI (Phase 1)

| # | Requirement | File | Precision |
|---|-------------|------|-----------|
| R2.1 | Create Settings → Smart reminders screen | `src/screens/Settings/Reminders.tsx` (NEW) | Mode toggle (3 segmented options), channel select (email/sms), push notification toggle with permission flow. Uses existing `NotificationBanner`/`notificationManager` patterns. |
| R2.2 | Add route | `src/App.tsx` | `<Route path="/settings/reminders" element={<Reminders />} />` |
| R2.3 | Add Settings nav row | `src/screens/Settings/index.tsx` | New "Automation" section with "Smart reminders" row → navigates to `/settings/reminders` |
| R2.4 | Extend recurring task card BottomSheet | `src/screens/Home/index.tsx` | In the `sheet === 'recurring_actions'` block (~line 2057): show current `reminder_mode` (with undefined → 'remind_me'), `last_reminder_sent_at`, `reminder_count`. Add "Change mode" option + "Edit reminder timing" option. |
| R2.5 | Add `setReminderMode` function | `src/lib/recurringJobs.ts` | `export async function setReminderMode(id: string, mode: ReminderMode): Promise<void>` — updates Dexie + sync queue |
| R2.6 | Add `updateReminderLeadDays` function | `src/lib/recurringJobs.ts` | `export async function updateReminderLeadDays(id: string, days: number): Promise<void>` — updates Dexie + sync queue, min 1, max 90 |
| R2.7 | Add `getReminderHistory` function | `src/lib/recurringJobs.ts` | `export async function getReminderHistory(id: string, limit?: number): Promise<ReminderLog[]>` — queries `db.reminder_log.where('recurring_job_id').equals(id).reverse().sortBy('sent_at')` |
| R2.8 | Update `advanceRecurrence` | `src/lib/recurringJobs.ts` | **[FIXED: G5]** Add `reminder_count: 0, last_reminder_sent_at: undefined, last_reminder_status: undefined` to the update object + sync queue payload |
| R2.9 | Add analytics events | `src/lib/analytics.ts` | `captureReminderModeChanged`, `captureReminderLeadDaysChanged`, `capturePushSubscribed`, `capturePushUnsubscribed` |

### R3: Server-side reminder endpoint (Phase 2)

| # | Requirement | File | Precision |
|---|-------------|------|-----------|
| R3.1 | Create reminder endpoint | `functions/api/cron-recurring-reminders.js` (NEW) | **[FIXED: B1]** Cloudflare Pages Function using `onRequestGet`. Exports `async function onRequestGet(context)`. Queries app's Supabase with service role key. Processes max 50 jobs per run. **[FIXED: G4]** Verifies `Authorization: Bearer <CRON_SECRET>` header. **[FIXED: I1]** Self-contained — no imports from sibling Functions. |
| R3.2 | Add env vars to Cloudflare dashboard | — | `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` already set. |
| R3.3 | Inline email send | `functions/api/cron-recurring-reminders.js` | **[FIXED: I1]** `fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: Bearer key }, body: JSON.stringify({ from: 'Buildlogg <noreply@mail.buildlogg.com>', to: [email], subject, html }) })` — same pattern as `feedback-notify.js` |
| R3.4 | Inline Web Push send | `functions/api/cron-recurring-reminders.js` | **[FIXED: I2]** Raw `fetch()` to subscription endpoint with VAPID JWT. Uses Web Crypto API for ECDSA signing. ~40 lines. |
| R3.5 | Inline template fill | `functions/api/cron-recurring-reminders.js` | **[FIXED: I3]** Server-side string replacement for `{firstName}`, `{jobTitle}`, `{bookingLink}`. Drift guard comment referencing `src/lib/templateEngine.ts`. |
| R3.6 | Create Supabase migration | `supabase/migrations/20260628000003_smart_reminders.sql` (NEW) | SQL from §4.4 |
| R3.7 | Batch notification logic | `functions/api/cron-recurring-reminders.js` | If ≥3 jobs due for same merchant in same run → send single batch push: "N recurring jobs due this week" |
| R3.8 | Auto-dormant logic | `functions/api/cron-recurring-reminders.js` | After processing, if `reminder_count >= 3` and `status = 'active'` → set `status = 'dormant'`, insert work_log `recurring_dormant_auto` |
| R3.9 | Fallback logic | `functions/api/cron-recurring-reminders.js` | If `remind_client` but no email → fall back to push to merchant. If `remind_client` but `last_reminder_status = 'bounced'` → skip email, push to merchant. |
| R3.10 | Rate limit handling | `functions/api/cron-recurring-reminders.js` | Max 50 jobs per run (SQL LIMIT). If Resend 429 → stop email sends, continue push sends. Log skipped jobs. |
| R3.11 | **[NEW]** Check `booking_enabled` before using booking link | `functions/api/cron-recurring-reminders.js` | **[FIXED: E22]** If `profile.booking_enabled = false`, replace `{bookingLink}` with "Reply to this email to book" or omit. |
| R3.12 | **[NEW]** Document external scheduler setup | `functions/api/cron-recurring-reminders.js` header comment | Three options: cron-job.org, GitHub Actions, separate Cloudflare Worker. Include curl example. |
| R3.13 | **[NEW]** Idempotency | `functions/api/cron-recurring-reminders.js` | SQL query ensures already-reminded jobs are not re-selected. Safe to call multiple times per day. |

### R4: Client push subscription + reminder log (Phase 3)

| # | Requirement | File | Precision |
|---|-------------|------|-----------|
| R4.1 | Create service worker | `public/sw.js` (NEW) | **[FIXED: B2]** Minimal SW: `push` event → `showNotification`, `notificationclick` → focus/open app. No caching. |
| R4.2 | Register service worker | `src/App.tsx` | **[FIXED: B2]** On mount: `if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})` |
| R4.3 | Create push subscription manager | `src/lib/pushSubscription.ts` (NEW) | `isPushSupported()`, `subscribePush(vapidKey)`, `unsubscribePush()`, `getPushSubscription()`. Uses `navigator.serviceWorker.ready.pushManager`. |
| R4.4 | Add push toggle to Settings | `src/screens/Settings/Reminders.tsx` | Toggle calls `subscribePush()` / `unsubscribePush()`. Saves subscription to `profiles.push_subscription_*` via `updateProfile`. Shows iOS unsupported message if `!isPushSupported()`. |
| R4.5 | Create reminder history component | `src/components/ReminderHistory/index.tsx` (NEW) | Shows last 5 `reminder_log` entries for a recurring job. Channel icon, date, status badge. |
| R4.6 | Add reminder status badges to task card | `src/screens/Home/index.tsx` | In `recurring_actions` sheet: if `last_reminder_sent_at` → "Reminder sent Nd ago" badge. If `bounced` → red warning. If `reminder_count >= 2` → amber warning. |
| R4.7 | Add `reminder_log` to sync | `src/lib/sync.ts` | Add `case 'reminder_log': await db.reminder_log.update(recordId, { _sync_status: status }); break;` to `updateSyncStatus`. Add `db.reminder_log` to `hasSyncError` tables array. |
| R4.8 | Add `reminder_log` + `payment_chases` to `initialSync` | `src/lib/initialSync.ts` | **[FIXED: B3]** `await syncTable(supabase.from('reminder_log').select('*').eq('user_id', userId), db.reminder_log);` AND `await syncTable(supabase.from('payment_chases').select('*').eq('user_id', userId), db.payment_chases);` |
| R4.9 | Add `reminder_log` to realtime | `src/lib/realtime.ts` | New Group 1 subscription: `supabase.channel('realtime:reminder_log:' + userId).on('postgres_changes', { event: '*', schema: 'public', table: 'reminder_log', filter: 'user_id=eq.' + userId }, handler).subscribe()` |
| R4.10 | Generate VAPID key pair | — | Run `npx web-push generate-vapid-keys` once. Store public key in `.env` as `VITE_VAPID_PUBLIC_KEY`. Store private key in Cloudflare Pages dashboard as `VAPID_PRIVATE_KEY`. |

### R5: Analytics

| # | Event | Trigger | Properties |
|---|-------|---------|------------|
| R5.1 | `reminder_mode_changed` | Merchant changes mode | `{ mode, context: 'settings' \| 'task_card', recurring_job_id? }` |
| R5.2 | `reminder_lead_days_changed` | Merchant edits lead days | `{ days, recurring_job_id }` |
| R5.3 | `push_subscribed` | Merchant enables push | `{ endpoint_domain }` |
| R5.4 | `push_unsubscribed` | Merchant disables push | `{ reason: 'manual' \| 'expired' }` |
| R5.5 | `auto_reminder_email_sent` | Sync pulls down reminder_log with email channel | `{ recurring_job_id, status }` |
| R5.6 | `recurring_auto_dormant` | Sync pulls down dormant status change | `{ recurring_job_id, reminder_count }` |

---

## 9. Dependencies & Prerequisites

| # | Dependency | Status | Notes |
|---|------------|--------|-------|
| D1 | P2-02: Recurring Jobs engine | ✅ Shipped | `recurringJobs.ts` + `recurring_jobs` table |
| D2 | P2-08: Message Templates | ✅ Shipped | `templateEngine.ts` + `message_templates` table |
| D3 | BN-1: Proactive notification permission | ✅ Shipped | `notificationManager.ts` + `NotificationBanner` |
| D4 | Supabase service role key (app project) | ✅ Available | Already used by `create-checkout-session.js` + `stripe-webhook.js` |
| D5 | Resend API key | ✅ Available | Already used by `feedback-notify.js`. Same key works. |
| D6 | Cloudflare Pages Functions | ✅ Deployed | `functions/api/` has 4 existing Functions. New one follows same pattern. |
| D7 | VAPID key pair | ⬜ Not generated | `npx web-push generate-vapid-keys` — needed for Phase 2 + 3 |
| D8 | Supabase migration applied | ⬜ Not run | `20260628000003_smart_reminders.sql` must be run in Supabase SQL Editor before Phase 2 |
| D9 | External scheduler account | ⬜ Not set up | cron-job.org (free) — needed for Phase 2. Configure after endpoint is deployed. |
| D10 | `VITE_VAPID_PUBLIC_KEY` in `.env` | ⬜ Not set | Needed for Phase 3 client-side push subscription |

---

## 10. Testing Checklist

### Phase 1 (client UI)
- [ ] Settings → Smart reminders screen renders with mode toggle + channel select
- [ ] Changing default mode in Settings persists to Dexie + syncs to Supabase
- [ ] Changing channel persists
- [ ] Recurring task card BottomSheet shows current mode (undefined → 'remind_me')
- [ ] Tapping "Change mode" on a recurring job updates it
- [ ] Editing reminder lead days persists (min 1, max 90)
- [ ] `recurring_reminder` template seeded for existing user on login
- [ ] `{bookingLink}` placeholder resolves in template preview
- [ ] `advanceRecurrence` resets `reminder_count`, `last_reminder_sent_at`, `last_reminder_status`
- [ ] Existing recurring jobs with undefined reminder fields don't crash
- [ ] Build: `tsc && vite build` passes
- [ ] Lint: `npm run lint` passes

### Phase 2 (server endpoint)
- [ ] Migration applied to Supabase (new columns + reminder_log table)
- [ ] Endpoint returns 401 without valid `CRON_SECRET` header
- [ ] Endpoint returns 200 with `{ processed, sent, failed, dormant }` JSON
- [ ] Recurring jobs due within `reminder_lead_days` get processed
- [ ] `remind_me` mode → push notification sent to merchant (if subscribed)
- [ ] `remind_client` mode → email sent via Resend (if customer has email)
- [ ] `both` mode → push + email sent
- [ ] No customer email → falls back to push to merchant
- [ ] `last_reminder_status = 'bounced'` → next run skips email, sends push
- [ ] 3+ jobs due for same merchant → single batch push notification
- [ ] `reminder_count` increments after each send
- [ ] 3 reminders with no response → auto-dormant
- [ ] `reminder_log` table populated in Supabase
- [ ] `recurring_jobs` updated with `last_reminder_sent_at` + `last_reminder_status`
- [ ] Failed sends → `last_reminder_status = 'failed'`, retried next run
- [ ] Bounced emails → `last_reminder_status = 'bounced'`, next cycle falls back to push
- [ ] Max 50 jobs per run enforced (SQL LIMIT)
- [ ] Resend 429 → email sends skipped, push continues
- [ ] `booking_enabled = false` → booking link omitted from email
- [ ] Calling endpoint twice in one day → no duplicate sends (idempotent)
- [ ] Endpoint logs visible in Cloudflare dashboard

### Phase 3 (SW + push + reminder history)
- [ ] Service worker registered on app load (DevTools → Application → Service Workers)
- [ ] `isPushSupported()` returns false on iOS Safari without Home Screen install
- [ ] `isPushSupported()` returns true on Chrome/Edge (desktop/Android)
- [ ] Toggling push in Settings → native permission prompt appears
- [ ] On grant → subscription saved to profile + syncs to Supabase
- [ ] On deny → toggle reverts, shows "Notifications blocked — enable in browser settings"
- [ ] Push notification received on device when endpoint fires (test with `curl -H "Authorization: Bearer <secret>" https://buildlogg.com/api/cron-recurring-reminders`)
- [ ] Tapping push notification opens app
- [ ] Reminder history component renders last 5 entries
- [ ] Status badges: sent (green), failed (amber), bounced (red)
- [ ] `reminder_log` syncs from Supabase to Dexie via `initialSync`
- [ ] `payment_chases` now syncs via `initialSync` (pre-existing fix)
- [ ] `reminder_log` realtime updates work (new entries appear without refresh)
- [ ] Unsubscribing push → `subscription.unsubscribe()` + profile fields cleared
- [ ] Build: `tsc && vite build` passes

---

## 11. Open Product Decisions

| # | Decision | Default | Alternatives |
|---|----------|---------|--------------|
| D1 | Is auto-email a Pro feature? | Free during beta | Gate behind `can('auto_reminders')` post-beta. Add `'auto_reminders'` to `Feature` type + `PRO_FEATURES` in `entitlements.ts`. Server-side check in the endpoint reads `subscription_status` from profile. |
| D2 | Should auto-email include an unsubscribe link? | Yes — add `{unsubscribeUrl}` placeholder | A client who doesn't want reminders shouldn't keep getting them. Reuse the existing `email_suppressions` table (in outreach Supabase) or create a lightweight suppression in the app Supabase. |
| D3 | Should the endpoint also handle quote follow-ups (P2-01) and payment chases (P2-03)? | No — this build is recurring only | Quote follow-ups and payment chases are client-side task cards. Server-side versions are a separate feature. |
| D4 | Should SMS (Twilio) be built in this phase? | No — email + push only | Twilio requires account setup, phone number purchase, and per-message cost. Build email first, add SMS as a follow-up. |
| D5 | What time should the external scheduler fire? | 09:00 BST (08:00 UTC) | Alternatives: 07:00 (before site), 12:30 (lunch). 09:00 is a reasonable middle ground. |
| D6 | Should recurring reminders respect the merchant's working days? | No in v1 — endpoint runs daily, sends regardless | If a reminder is due on a Sunday but the merchant doesn't work Sundays, the push notification still fires. The merchant can snooze. Configurable "skip weekends" is a v2 enhancement. |
| D7 | **[NEW]** Which external scheduler to use? | cron-job.org (free, simple) | Alternatives: GitHub Actions (free, requires repo), separate Cloudflare Worker (free, requires second wrangler.toml). Document all three. |

---

## 12. Out of Scope (explicitly deferred)

| Feature | Why deferred |
|---------|-------------|
| SMS auto-send (Twilio) | Requires Twilio account setup + per-message cost. Email covers the free tier. |
| WhatsApp Business API auto-send | Explicitly deferred in PRD — expensive, Meta approval. |
| Auto-detect client response from email | Would require reply-to tracking + email parsing. v2. |
| "Skip weekends" for scheduler | Nice-to-have. Endpoint runs daily; merchant can snooze. |
| Per-day reminder times | Endpoint fires once daily at 09:00. Per-job time customization is v2. |
| Recurring reminder analytics dashboard | PostHog events are captured but no dashboard view. Use PostHog directly. |
| Client-side cron fallback | If external scheduler fails, no client-side fallback. The existing task card system still shows due jobs when the app is open. |
| Email unsubscribe for clients | v2 — add `{unsubscribeUrl}` placeholder + suppression table in app Supabase. |
| Resend webhook integration for bounce detection | v2 — the endpoint checks Resend API response synchronously. Real-time webhook integration for bounces/complaints is a follow-up. |

---

*Author: Hermes Agent (audited and amended)*
*Date: 2026-06-27*
*Project: Buildlogg (TradePad)*
*PRD reference: FUTURE.md W3-1*
*Audit: 3 blockers fixed, 5 gaps fixed, 4 improvements applied*
