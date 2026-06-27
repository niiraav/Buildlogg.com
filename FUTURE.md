# Buildlogg — Future Feature Roadmap

> **Last updated:** 2026-06-26
> **Method:** Merchant-first. Every feature starts from a use case Dave or Sophie actually lives.
> **Product thesis:** Phase 1 = "it works." Phase 2 = "it's professional." Phase 3 = "it grows my business."

---

## Personas

**Dave** — plumber, 45, phone-first, not tech-savvy. 30-40 customers, 15-20 active jobs, 5-10 quotes/week. Pain: forgetting quote follow-ups, losing repeat customers, late payers, no online presence.

**Sophie** — nail tech / lash artist, 30s, Instagram-first, tech-comfortable. 50+ clients, 15-20 appointments/week. Pain: no online booking (clients DM at midnight), deposit no-shows, remembering client preferences, syncing calendar.

---

## BUILD NOW (alongside P2-01/02/03)

### BN-1. Proactive Notification Permission Flow

**Problem:** `requestNotificationPermission()` fires silently on first Home visit with no context. The browser shows a generic "Allow notifications?" prompt. Most users deny it because they don't understand what they'll get. Without notifications, the end-of-day review prompt (Missing #3), stale job nudges, and booking alerts all fail silently.

**Solution:** Don't fire the native permission prompt cold. Instead:
1. On first Home visit, show an in-app banner: "Turn on notifications so Buildlogg can remind you when jobs are done, quotes go stale, and payments are due." with "Allow" and "Maybe later" buttons.
2. Only when the user taps "Allow" → fire `Notification.requestPermission()`.
3. If denied, re-prompt contextually: when Dave sends his first quote → "Want a reminder to follow up on this quote in 2 days? Turn on notifications." The prompt is tied to a concrete benefit, not a generic ask.
4. If denied 3 times, stop asking. Respect the user's choice.
5. Track notification opt-in rate in PostHog: `notification_permission_requested`, `notification_permission_granted`, `notification_permission_denied`.

**Build cost:** Low. A dismissible banner component + contextual re-prompts at key moments (first quote sent, first job marked done, first payment recorded). No new data model — uses localStorage to track denial count.

**Serves:** Both. Dave needs stale-job nudges. Sophie needs booking alerts (future). Neither will enable notifications without understanding the value.

---

### BN-2. Expense & Profit Tracking

**Problem:** Dashboard shows "£2,340 earned this month." But Dave spent £800 on materials. His profit is £1,540, not £2,340. Sophie spent £200 on gel and lashes. Neither knows their actual profit. The dashboard is showing a misleading number.

**Solution:**
1. Add an "expense" entry type to the work log: `type: 'expense'` with `amount` and `description` (e.g., "Boiler parts — £320 — Screwfix").
2. Expenses can be logged per-job (materials bought for a specific job) or general (bulk supplies not tied to a job).
3. Dashboard shows: Revenue £2,340 → Expenses £800 → **Profit £1,540**
4. Per-job profitability: each job card shows revenue, expenses, and profit.
5. Sophie logs "Gel polish bulk order — £180" as a general expense → distributed across the month's appointments.

**Data model:** Use the existing `WorkLogEntry` with `type: 'expense'` and `amount` field (already exists). Add `is_general: boolean` for non-job-specific expenses. No new table needed.

**Build cost:** Low-Medium. New work log type, expense entry UI (from JobDetail "Add charge" flow already exists — extend it), dashboard computation update.

**Serves:** Both. Dave needs to know if he's actually profitable after materials. Sophie needs to know if her product costs are eating her margin.

---

### BN-3. Quote Revision Flow

**Problem:** Customer says "that's too much." Dave has to navigate back to the quote builder, edit items, re-preview, re-send. The original quote is lost. There's no "revise" button from the quoted state.

**Solution:**
1. On the quoted job detail page, add a "Revise quote" button (secondary, next to "Mark as Booked").
2. Tapping it navigates to the QuoteBuilder with the existing job loaded — Dave edits line items, changes amounts, adds/removes items.
3. On re-send, the evidence trail captures the new quote content. The work log shows two "Quote sent" entries with different totals — the revision history is preserved.
4. The quote expiry timer resets on revision (new `quote_sent_at`).

**Build cost:** Low. The QuoteBuilder already edits existing jobs. This is just a navigation button + resetting the quote timestamp. No new data model.

**Serves:** Both. "Can you do it cheaper?" is the most common response to a quote for both trades and beauty.

---

### BN-4. Historical Pricing Reference (integrated with Custom Items)

**Problem:** Dave is quoting a boiler install. He's done 5 this year but can't remember what he charged. He guesses £450. Last time he charged £520. He's underpricing by £70 per job.

**Solution — integrated with the existing Custom Items library:**

The custom items library (`custom_items` table) already stores Dave's regular charges: "Radiator £85", "Labour £120", "Boiler service £95". These are his *standard* prices. But when he quotes, he sometimes adjusts them per job. The historical pricing reference surfaces the *actual prices he's charged across all past jobs*, not just his library defaults.

**How it works:**
1. In the QuoteBuilder, when Dave types a job title → query Dexie for past jobs with the same or similar title → show: "You've quoted 'Boiler install' 5× — £450 to £520, avg £485."
2. When Dave adds a line item via a chip (from his custom items library) → if he's charged that item before at different amounts, show a subtle hint: "Last charged: £520 (2 weeks ago)" next to the amount field.
3. The hint uses past `line_items` records, not the custom_items library — so it reflects *actual* charges, not just saved defaults.
4. If the user has no history for that item, the custom item's default amount is used (current behaviour, unchanged).

**Integration with custom items:**
- Custom items = the *starting* price (what Dave has saved as his default)
- Historical reference = the *actual* price range (what Dave has actually charged across jobs)
- The hint shows both: "Your default: £85. Last 5 charges: £80-£95, avg £87."
- Dave can tap the hint to auto-fill the average, or type his own amount.

**Data model:** No new tables. Query `line_items` joined to `jobs` by description text. Cache the results per session (re-compute only when the job title changes).

**Build cost:** Low. Dexie query for past line items with matching description, computation of min/max/average, subtle hint UI in the QuoteBuilder. No new data model.

**Serves:** Both. Dave avoids underpricing. Sophie avoids inconsistent treatment pricing ("I charged Emma £45 last time but £35 for the same thing today?").

---

## WAVE 1 — Planning & Accuracy (after P2 completes)

### W1-1. Week View

**Problem:** Home shows today. Jobs shows everything. Nothing in between. Sophie needs to see her week at a glance. Dave needs to see his pipeline (3 jobs this week, 2 next, nothing after — chase quotes).

**Solution:** A week view (either a 7-day strip or a simple day-by-day list) accessible from Home or Jobs. Shows scheduled jobs grouped by day with time slots. Tap any day to drill into the existing Home/today view.

**Build cost:** Medium. New view component, aggregates jobs by day for current + next 2 weeks.

**Serves:** Both. Sophie plans her week. Dave spots empty days and fills them.

---

### W1-2. End-of-Day Review Prompt

**Problem:** Dave finishes a job at 4pm, drives home, forgets to mark it done. Next morning the job still shows "In progress." Stale detection catches it after 24 hours, but by then the data is already inaccurate.

**Solution:**
1. At a configurable time (default 6pm), if the user has notification permission → push notification: "You had 1 job today — Mark O'Connor, radiator install. Mark as complete?"
2. Tapping the notification opens a review sheet: today's in-progress jobs with "Complete" / "Still working" buttons.
3. If notification permission denied → show the review sheet as an in-app banner next time Dave opens the app (checking if it's after 6pm and there are uncompleted jobs from today).
4. "Complete" triggers the existing mark-done flow (photo → payment). "Still working" dismisses the prompt for today.

**Depends on:** BN-1 (proactive notification permission). Without notifications, this falls back to the in-app banner, which is less effective.

**Build cost:** Low-Medium. Scheduled notification (existing `checkEndOfDay` function extended), review sheet component, in-app banner fallback.

**Serves:** Both. Dave's data stays accurate. Sophie marks her appointments complete at end of day instead of forgetting.

---

### W1-3. Client Preferences & Notes (P3-05)

**Problem:** Sophie can't remember that Emma is allergic to latex, that Lisa wants 2mm longer lashes. Dave can't remember "Mark's boiler is the 2012 Worcester — parts are hard to find." The `notes` field exists in the Customer interface but isn't exposed in the UI.

**Solution:** Expose the notes field on CustomerDetail + show a prominent notes banner on JobDetail for that customer. Add an "⚠ Important" flag that pins critical notes (allergies, safety) to the top.

**Build cost:** Low. The `notes` field already exists in the Customer interface. Just needs UI.

**Serves:** Both. Sophie's client retention depends on personalisation. Dave's technical notes save diagnostic time.

---

## WAVE 2 — Booking Funnel (the big build)

### W2-1. Client-Facing Booking Page

**Problem:** Sophie gets Instagram DMs at midnight. Clients want to self-serve. Dave's commercial clients want to book without phone tag.

**Solution:** A public booking page at `buildlogg.com/book/:slug` that shows the merchant's services, available time slots (synced with their Dexie job calendar), and a booking request form. Requires server-side rendering (Cloudflare Function) so it works when the merchant's phone is off.

**This is a second product surface, not a feature.** It requires: service catalogue, availability logic, server-side rendering, booking request storage, push notifications to the merchant, confirm/reject flow, QR code generation.

**Build cost:** Very High. New Cloudflare Pages route, service catalogue data model, availability sync, booking request flow, merchant notification + confirm/reject UI.

**Serves:** Sophie (core — replaces Instagram DMs). Dave (nice-to-have — commercial clients self-serve).

---

### W2-2. Stripe Deposit + Payment Links (P3-03)

**Problem:** Sophie takes deposits via bank transfer. 1 in 5 clients no-show. Dave loses £800 when a big job cancels.

**Solution:** Stripe Payment Links generated from the app. Client pays by card. Job status updates automatically. Deposit/balance tracking.

**Build cost:** High. Stripe integration, webhook handler (Cloudflare Worker), payment status sync.

**Serves:** Sophie (core — reduces no-shows). Dave (protects big jobs).

---

### W2-3. Referral Engine (P3-04)

**Problem:** Word-of-mouth is the #1 acquisition channel but it's completely passive. Dave can't track referrals. Sophie can't convert Instagram tags into bookings.

**Solution:** Shareable booking link (from W2-1) + referral attribution ("How did you hear about me?" on booking page) + dashboard referral tracking.

**Depends on:** W2-1 (booking page is the destination).

**Build cost:** Medium (if booking page exists). Standalone: High.

**Serves:** Both.

---

## WAVE 3 — Retention & Intelligence

### W3-1. Smart Reminders & Auto-Messaging (P3-06)

**Builds on:** P2-02 (Recurring Jobs). The recurring engine is the data layer; auto-messaging is the activation layer.

**Problem:** Sophie manually texts 20 clients every 4 weeks. Dave doesn't chase annual service reminders.

**Solution:** Auto-send WhatsApp/SMS reminders for recurring jobs. Configurable: "Remind me" (task card) vs "Remind client" (auto message) vs "Both." Uses the template engine.

**Requires:** Server-side cron (Cloudflare Worker + Cron Trigger) for auto-sending.

**Build cost:** Medium.

**Serves:** Both.

---

### W3-2. Multi-Device Cloud Sync Enhancement (P3-09)

**Problem:** Dave's phone breaks → data gone (local-first Dexie). Sophie wants phone + iPad workflow.

**Solution:** Harden initialSync (pull all data from Supabase on new device). Add real-time sync via Supabase subscriptions. Conflict resolution (last-write-wins for now).

**Build cost:** Medium. initialSync exists but needs testing. Real-time sync is new.

**Serves:** Both. Data insurance + multi-device.

---

### W3-3. Business Insights & Coaching (P3-08)

**Problem:** Dashboard shows numbers but no context. "£2,340 this month" — is that good? "68% win rate" — is that high?

**Solution:** Insight cards on the dashboard with plain-English coaching: "Your win rate dropped — are you pricing too high?" "Thursday is your most profitable day." Each insight has a CTA.

**Depends on:** BN-2 (expense tracking) — insights need profit data, not just revenue.

**Build cost:** Medium. Insight generation engine (computation on existing data), insight cards, CTA routing.

**Serves:** Both.

---

## DEFERRED

| Feature | Why Deferred |
|---------|-------------|
| Calendar Sync (iCal) | Nice-to-have, not urgent. iCal feed is Medium cost but low daily friction. |
| Supplier Price Tracking | Builds on expense tracking (BN-2). Not standalone — build after expense data exists for 3+ months. |
| Full Stripe checkout (in-app) | Payment links cover the 80% case. Full checkout is Phase 4. |
| Inventory management | Too complex, niche. |
| Multi-staff scheduling | Solo trader product thesis. |
| AI-powered quote pricing | Dangerous — Dave knows his pricing, AI creates liability. |
| WhatsApp Business API | Expensive, Meta approval, ToS restrictions. `wa.me` works for 95%. |
| Accounting integration (Xero/QuickBooks) | CSV export covers the 80% case. |

---

## Priority Summary

| Priority | Feature | Impact | Cost | Serves |
|----------|---------|--------|------|--------|
| **BUILD NOW** | BN-1: Proactive notification permission | HIGH (enables all notifications) | Low | Both |
| **BUILD NOW** | BN-2: Expense & profit tracking | HIGH (fundamental data) | Low-Med | Both |
| **BUILD NOW** | BN-3: Quote revision flow | HIGH (daily friction) | Low | Both |
| **BUILD NOW** | BN-4: Historical pricing reference | HIGH (revenue leak) | Low | Both |
| **WAVE 1** | W1-1: Week view | MEDIUM (planning) | Medium | Both |
| **WAVE 1** | W1-2: End-of-day review prompt | HIGH (data accuracy) | Low-Med | Both |
| **WAVE 1** | W1-3: Client preferences & notes | MED-HIGH (CRM depth) | Low | Both |
| **WAVE 2** | W2-1: Client-facing booking page | HIGH (acquisition) | Very High | Sophie core, Dave nice-to-have |
| **WAVE 2** | W2-2: Stripe deposits + payments | HIGH (revenue protection) | High | Sophie core |
| **WAVE 2** | W2-3: Referral engine | MED-HIGH (growth) | Medium | Both |
| **WAVE 3** | W3-1: Smart reminders & auto-messaging | HIGH (Sophie) | Medium | Both |
| **WAVE 3** | W3-2: Multi-device cloud sync | HIGH (retention) | Medium | Both |
| **WAVE 3** | W3-3: Business insights & coaching | MEDIUM (lock-in) | Medium | Both |

---

## P2 Features Being Built Now (for reference)

| Feature | Status | Description |
|---------|--------|-------------|
| P2-01: Automated Quote Follow-Up | Building | Stale quote task cards + snooze + pre-filled WhatsApp chase |
| P2-02: Recurring Job Reminders | Building | Annual/quarterly/monthly/4-weekly recurrence + task cards |
| P2-03: Overdue Payment Escalation | Building | Escalation ladder (7d gentle → 14d firm → 30d call → 60d final) |

## P2 Features Already Shipped

| Feature | Description |
|---------|-------------|
| P2-05: PDF Quotes & Invoices | jsPDF + autoTable, branded, logo, VAT, bank details |
| P2-06: Scheduling Conflicts | Overlap + back-to-back + travel time detection |
| P2-07: Customer CRM | Customer list, search, stats, archive, dedup, merge |
| P2-08: Message Templates | Placeholder engine, 7 default templates, template editor |
| P2-09: Revenue Dashboard | Earnings, outstanding, win rate, avg job value, export |
| P2-10: Google Reviews | Post-payment WhatsApp/SMS prompt, Google Business URL setup |
| Sample Job Onboarding | Seeded interactive demo job on first run |
| Evidence Trail | Full message content stored in work log for all 7 message types |
| SendSheet | Unified send sheet with PDF toggle, WhatsApp/SMS/copy |
| Entitlements | Pro feature gating architecture |

---

*Last updated: 2026-06-26*
*Author: Codex*

## Booking Page — Lunch Breaks (Future)

Currently slots are continuous through working hours with no lunch break.
Future: add `booking_break_start` and `booking_break_end` to Profile (e.g., 12:00–13:00).
The booking page Function would skip slots that overlap the break period.
Sophie (beauty) needs this — she takes a lunch break midday. Dave (trades) less so.

Also consider: per-day hours (e.g., Saturday 10am–2pm instead of full 9–5).
Currently all working days use the same hours. Per-day hours would need a
JSON field like `booking_hours_per_day: {"0": "10:00-14:00", "1": "09:00-17:00", ...}`.
Added: 2026-06-28
