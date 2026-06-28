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

## Booking Page — Lunch Breaks + Per-Day Hours (✅ Shipped — commit 7e576f5, merged 0d2889b)

Slots now skip break periods. `booking_break_start` and `booking_break_end` on Profile.
The booking page Function skips slots that overlap the break period.
Sophie (beauty) needed this — she takes a lunch break midday.

Per-day hours shipped: `booking_hours_per_day` JSON field on Profile.
e.g., Saturday 10am–2pm while weekdays use global 9–5.
Added: 2026-06-28
Shipped: 2026-06-28

---

## Cross-Utilization Audit (2026-06-28)

> **Method:** Audited every built feature against every screen/flow to find
> engines that work but are wired to only one touchpoint. The highest-leverage
> improvements aren't new features — they're connecting existing engines to
> the moments where the user actually needs them.

### Booking Engine — Underutilized Touchpoints

The booking engine (`functions/book/[[slug]].js` + `src/lib/booking.ts`) is
fully functional but the booking link is **trapped in Settings**. It's never
surfaced at the moments where sharing it would have the most impact.

#### BU-1. Booking link on QuoteSent screen
**Problem:** Customer just received a quote. The "What happens next" card says
"open the job and tap Mark as Booked" — but doesn't offer the self-serve
booking page. The customer is already engaged; making them phone-tag to book
is friction.
**Solution:** If `booking_enabled && booking_slug`, show a "Or let them book
online" section on QuoteSent with a one-tap "Share booking link" button that
copies/opens `bookingPageUrl(slug)`.
**Leverages:** `bookingPageUrl()` in `referral.ts`, QuoteSent screen.
**Effort:** S

#### BU-2. Booking link in quote message text
**Problem:** The WhatsApp/SMS message the customer receives has no booking
link. If the customer says "yes, when can you do it?", Dave has to manually
share his booking link in a separate message.
**Solution:** If `booking_enabled`, append `"\n\nBook online: buildlogg.com/book/{slug}"`
to the quote message in `QuotePreview.tsx` `defaultMessage` and the
`templateEngine` quote template.
**Leverages:** `bookingPageUrl()`, `QuotePreview.defaultMessage`, `templateEngine.ts`.
**Effort:** S

#### BU-3. Booking link on CustomerDetail
**Problem:** When a merchant views a repeat customer, there's no "Share booking
link" button. Sophie's client Emma needs a lash infill — Sophie should be able
to send the booking page from the customer profile in one tap.
**Solution:** Add a "Send booking link" button on CustomerDetail that opens
WhatsApp with a pre-filled message: "Hi {firstName}, book your next appointment
online: {bookingUrl}".
**Leverages:** `bookingPageUrl()`, CustomerDetail screen, existing WhatsApp
deep-link pattern.
**Effort:** S

#### BU-4. Booking link in post-payment rebook prompt
**Problem:** When a job is marked paid, the Google Review prompt fires — but
there's no "Book your next appointment" link. For Sophie (recurring 4-week
appointments), the post-payment moment is when the client is happiest and
most likely to rebook.
**Solution:** If `booking_enabled`, show a "Rebook" button next to the review
prompt on the paid job detail screen. Tapping it sends the booking link via
WhatsApp.
**Leverages:** `bookingPageUrl()`, existing review prompt pattern in JobDetail,
SendSheet.
**Effort:** S

#### BU-5. Deposit collection on the booking page
**Problem:** The booking function creates a `booking_request` with
`service_amount` but there's no payment step. Sophie's #1 pain is no-shows.
If the booking page offered "Pay £10 deposit to secure your slot" via the
existing Stripe checkout, the booking engine would directly solve her
biggest problem.
**Solution:** Add an optional deposit step to the booking page POST handler.
If the merchant's `payment_terms === 'deposit'`, after the booking request is
created, call `createCheckoutSession` with `type: 'deposit'` and redirect the
client to the Stripe Checkout URL. On webhook payment, link the payment to the
accepted job.
**Leverages:** `createCheckoutSession` Function, `stripe-webhook` handler,
`booking_requests` table, `Profile.payment_terms`.
**Effort:** M

#### BU-6. Booking accept flow with deposit link
**Problem:** When Dave taps "Accept booking", it creates a job and opens a
SendSheet with a confirmation message. But if the job's payment terms are
`deposit`, there's no option to attach a Stripe deposit link. Dave has to
separately go into the job → menu → Request card payment → send another
message. 4 extra steps for the most common post-booking action.
**Solution:** In the booking accept flow (`acceptBookingRequest`), if
`profile.payment_terms === 'deposit'` and `stripe_connected`, auto-generate a
Stripe deposit link and include it in the confirmation message.
**Leverages:** `acceptBookingRequest()` in `booking.ts`,
`createCheckoutSession()`, SendSheet.
**Effort:** S-M

#### BU-7. Merchant logo on the booking page
**Problem:** The booking page renders a plain text header with the business
name. `Profile.logo_data_url` exists and is used in PDF generation. The
booking page is the customer's first impression — it should show the logo.
**Solution:** In `renderBookingPage`, if `merchant.logo_data_url`, render an
`<img>` tag in the header. The logo is stored in Supabase (or as a data URL
on the profile).
**Leverages:** `Profile.logo_data_url`, `renderBookingPage` in the booking
Function.
**Effort:** S

### Card Payment Links — Underutilized Touchpoints

The Stripe integration (`createCheckoutSession` + webhook + `stripe.ts`) works
end-to-end but the payment link is **buried in the job menu** and never offered
at the moments where collecting payment is most natural.

#### CU-1. Payment link in the job completion sheet
**Problem:** When Dave taps "Complete & take payment", he gets a sheet with
cash/bank transfer/other. The Stripe "Request card payment" option is in the
separate "More" menu. The card payment option should be in the completion
sheet itself — that's the moment Dave is collecting payment.
**Solution:** In the `mark_done` sheet (or `mark_paid` sheet), if
`stripe_connected`, add a "Send card payment link (£X)" option as a primary
button alongside cash/bank transfer. Tapping it calls
`handleRequestStripePayment('full')`.
**Leverages:** `handleRequestStripePayment()`, `mark_done` / `mark_paid`
sheets in JobDetail.
**Effort:** S

#### CU-2. Auto-generated Stripe link in payment chase messages
**Problem:** The payment chase engine creates a 4-stage escalation ladder
(7d → 14d → 30d → 60d). But chase messages are plain text reminders. If
Stripe is connected, the chase message should include a payment link so the
customer can pay immediately.
**Solution:** When generating a chase message (in the task card action), if
`stripe_connected`, call `createCheckoutSession` for the outstanding amount
and embed the URL in the pre-filled WhatsApp message.
**Leverages:** `paymentChase.ts` engine, `createCheckoutSession()`, task card
send action.
**Effort:** S-M

#### CU-3. "Pay online" QR code on invoice PDFs
**Problem:** `pdfGenerator.ts` generates branded PDFs with line items and bank
details. But if Stripe is connected, the PDF should include a QR code linking
to the Stripe checkout so the customer can pay without calling Dave.
**Solution:** In `pdfGenerator.ts`, if `stripe_connected` and a checkout URL
exists for the job, render a QR code (using `prettyQr.ts`) in the invoice
footer: "Scan to pay by card".
**Leverages:** `prettyQr.ts` QR generation, `pdfGenerator.ts`,
`Job.deposit_stripe_url` or a fresh `createCheckoutSession` call.
**Effort:** S-M

#### CU-4. Card payment upsell at the chase moment
**Problem:** When Dave's payment is 7 days overdue and he's chasing it, that's
the moment he feels the pain of not having card payments. But there's no
contextual nudge to enable it.
**Solution:** On the payment chase task card, if `!stripe_connected`, show a
subtle nudge: "Tired of chasing? Enable card payments to let customers pay
online →" linking to Settings.
**Leverages:** Payment chase task cards on Home, `stripe_connected` flag.
**Effort:** S

### Existing Features — Cross-Utilization Opportunities

#### XU-1. Trade templates as "Quick Start" in QuoteBuilder
**Problem:** `tradeTemplates.ts` has 10+ pre-filled line items per trade
(plumber, electrician, builder). But they're only used during onboarding
seeding. Dave can't tap "Boiler install template" in the QuoteBuilder to
pre-fill all items.
**Solution:** Add a "Start from template" button in the QuoteBuilder items
section. Tapping it opens a sheet showing trade-specific templates. Selecting
one fills the items list with all template line items.
**Leverages:** `TRADE_TEMPLATES` in `tradeTemplates.ts`, QuoteBuilder items
section, BottomSheet.
**Effort:** S

#### XU-2. Pricing history on Dashboard and CustomerDetail
**Problem:** `pricingHistory.ts` queries past line items to show price ranges.
But it's only used in the QuoteBuilder. The Dashboard should show "your
average boiler install is £485 across 5 jobs" and CustomerDetail should show
"you've charged this customer £1,240 across 4 jobs".
**Solution:** Add a "Pricing insights" card on the Dashboard using
`getJobTitlePricing`. On CustomerDetail, show total spent + job count (already
computed by `getCustomerStats` but not prominently displayed).
**Leverages:** `pricingHistory.ts`, `getCustomerStats()` in `customers.ts`,
Dashboard screen, CustomerDetail screen.
**Effort:** S

#### XU-3. Recurring jobs on CustomerDetail and Dashboard
**Problem:** Recurring jobs are only surfaced as task cards on Home when a
reminder is due. There's no way to see all recurring jobs for a specific
customer, or a summary on the Dashboard.
**Solution:** On CustomerDetail, show "Next service: boiler service due in 3
weeks" with a "Send reminder" button. On Dashboard, show "£1,600 in recurring
revenue tracked" as a stat card.
**Leverages:** `recurringJobs.ts` engine, `RecurringJob` table,
CustomerDetail, Dashboard.
**Effort:** S-M

#### Xu-4. Customer notes banner on JobDetail
**Problem:** `customer.notes` is editable on CustomerDetail but invisible when
Dave is actually doing the job. If the note says "Key under the flowerpot",
Dave doesn't see it when he opens the job.
**Solution:** On JobDetail, if the customer has notes, show a banner at the
top: a yellow/amber card with the notes text and an "⚠ Important" icon.
**Leverages:** `Customer.notes` field (already exists), JobDetail screen,
existing banner pattern (amber-50 style from Settings).
**Effort:** S

#### XU-5. QR codes on invoice PDFs (payment + booking)
**Problem:** `prettyQr.ts` generates beautiful QR codes but is only used for
the booking page link in Settings. Invoice PDFs and quote PDFs could include
QR codes for payment (Stripe link) and rebooking (booking page URL).
**Solution:** In `pdfGenerator.ts`, add a QR code section to the invoice
footer: if Stripe is connected, a "Pay by card" QR; if booking is enabled, a
"Book again" QR.
**Leverages:** `prettyQr.ts`, `pdfGenerator.ts`, `bookingPageUrl()`.
**Effort:** S-M

#### XU-6. Mini stat on Home screen
**Problem:** Dashboard computes earnings, outstanding, win rate — but the Home
screen shows no financial summary. Dave opens the app and sees tasks but no
"£340 earned today" feedback.
**Solution:** Add a compact stat strip on the Home screen header (below the
greeting): "Today: 2 jobs · £340" or "This month: £2,340 · 3 awaiting
payment". Uses the existing `getDashboardStats` computation, scoped to today.
**Leverages:** `getDashboardStats()` in `dashboard.ts`, Home screen header.
**Effort:** S

#### XU-7. Message templates in booking confirmation + payment chase
**Problem:** `templateEngine.ts` fills `{placeholders}` in saved templates.
But the booking confirmation message (in `booking.ts`) and the payment chase
messages are hardcoded strings, not template-driven. If Dave edits his
"Booking confirmation" template, the booking accept flow ignores it.
**Solution:** In `acceptBookingRequest`, use the user's "booking" category
template (filled by `templateEngine`) instead of the hardcoded
`confirmationMessage`. In payment chase task actions, use the "follow_up" or
"invoice" template.
**Leverages:** `templateEngine.ts` `fillTemplate()`, `seedMessageTemplates`
"booking" category, `booking.ts` confirmation, `paymentChase.ts`.
**Effort:** S-M

#### XU-8. Scheduling conflicts in booking accept flow
**Problem:** `scheduling.ts` detects overlapping jobs, back-to-back gaps, and
travel time. But the booking accept flow only does a basic overlap check
(`checkBookingConflict`), not the full conflict engine with travel time and
back-to-back warnings.
**Solution:** In the booking request sheet on Home, use the full
`detectConflicts` from `scheduling.ts` to warn about travel time and
back-to-back gaps, not just direct overlaps.
**Leverages:** `scheduling.ts` `detectConflicts()`, booking request sheet on
Home.
**Effort:** S

#### XU-9. Voice input on expense entry + customer notes
**Problem:** Voice input (`voiceInput.ts`) is wired into QuoteBuilder item
descriptions and JobDetail notes. But not into expense entry, customer notes,
or booking request notes.
**Solution:** Add `VoiceInputButton` to the expense entry form in JobDetail,
the customer notes editor in CustomerDetail, and the booking notes field.
**Leverages:** `VoiceInputButton` component, existing fields.
**Effort:** S

#### XU-10. Calendar ICS export for all upcoming jobs + recurring reminders
**Problem:** The "Add to calendar" button exists on individual booked jobs.
But there's no "Export all upcoming jobs" or auto-add-to-calendar when a
recurring reminder fires.
**Solution:** Add a "Export calendar" button on the Dashboard or Jobs screen
that generates an ICS file with all booked/in-progress jobs. When a recurring
reminder fires, offer "Add to calendar" on the task card.
**Leverages:** `calendar.ts` `generateICS()`, Dashboard/Jobs screen,
recurring job task cards.
**Effort:** S-M

### Priority Ranking — Cross-Utilization

| # | Feature | Impact | Effort | Serves | Status |
|---|---------|--------|--------|--------|--------|
| 1 | CU-1: Payment link in completion sheet | HIGH — payment moment | S | Both | ✅ Shipped (cf4c652) |
| 2 | BU-2: Booking link in quote message | HIGH — reduces phone tag | S | Both | ✅ Shipped (cf4c652) |
| 3 | XU-1: Trade templates in QuoteBuilder | HIGH — saves 5 min per quote | S | Both | ✅ Shipped (cf4c652) |
| 4 | XU-4: Customer notes banner on JobDetail | HIGH — prevents site visit problems | S | Both | ✅ Already built |
| 5 | BU-1: Booking link on QuoteSent | MED-HIGH — self-serve booking | S | Both | ⬜ Next |
| 6 | CU-2: Stripe link in chase messages | HIGH — gets overdue money | S-M | Both | ✅ Shipped (c83f5de) |
| 7 | BU-4: Rebook link post-payment | MED — recurring revenue | S | Sophie core | ✅ Shipped (c83f5de) |
| 8 | XU-7: Templates in booking + chase | MED — consistency | S-M | Both | ✅ Shipped (0577849) |
| 9 | BU-5: Deposits on booking page | HIGH — reduces no-shows | M | Sophie core | ✅ Shipped (0577849) |
| 10 | XU-6: Mini stat on Home | MED — daily feedback | S | Both | ⬜ |

*Audit date: 2026-06-28*
*Updated: 2026-06-28 — all Cross-Utilization items shipped*
*Also shipped: XU-2 (Pricing insights on Dashboard + avg/job on CustomerDetail) — commit 7c995cc*
*Also shipped: BU-3 + BU-7 + CU-3/XU-5 (booking link on CustomerDetail, logo on booking page, QR codes on invoice PDFs) — commit 255a226*
*Also shipped: BU-6 + CU-4 (booking accept deposit link + card payment upsell nudge) — commit 99ba61b*
*Author: Codex*

---

## Sprint 1: Email Capture + Recurring Mode Selection (W3-1 Channel Fix)

> **Date:** 2026-06-28
> **Date:** 2026-06-28
> **Status:** ✅ Shipped (commit 0cc9807, merged 2bc47c5)
> **Goal:** Solve the W3-1 channel problem. Auto-reminders need email data, but email is barely captured today. These 5 changes make email capture natural at the moments where the customer is present or the merchant has intent.

### Problem

W3-1 Smart Reminders shipped with `remind_client` mode (auto-email the client). But email is captured in only 2 places (AddCustomer optional field, booking page optional field) and neither is a high-intent moment. Dave's 30-40 customers likely have 0-3 emails on file. Sophie's 50+ clients likely have 5-10 (only from the booking page). The auto-email mode will silently fall back to push for 95%+ of customers.

### Items

| # | Feature | Files | Effort | Status |
|---|---------|-------|--------|--------|
| 1 | Email field on Quote CustomerDetails step | `CustomerDetails.tsx`, `Quote/index.tsx` | Cheap | ✅ |
| 2 | Email capture on recurring_prompt sheet (shown when customer has no email) | `JobDetail/index.tsx`, `Home/index.tsx` | Cheap | ✅ |
| 3 | Email edit on CustomerDetail (InlineEditRow) | `CustomerDetail.tsx`, `InlineEditRow/index.tsx` | Cheap | ✅ |
| 4 | Mode selection on recurring_prompt sheet (Remind me / Auto-message / Both) | `JobDetail/index.tsx`, `Home/index.tsx` | Cheap | ✅ |
| 5 | Email coverage stat in Reminders settings ("X of Y clients have email") | `Reminders.tsx` | Cheap | ✅ |

### Sequencing

- Steps 1 + 3 + 5: parallel (disjoint files)
- Steps 2 + 4: serial (both modify recurring_prompt sheets)
- Order: 1 → 3 → 5 (parallel) → 2 + 4 (serial)

### Edge Cases

- **No email on file**: recurring_prompt shows email input field; CustomerDetail shows "Add email" placeholder
- **Customer already has email**: recurring_prompt skips email field, shows interval + mode only
- **Invalid email**: no validation in v1; bounces caught by cron endpoint (`last_reminder_status = 'bounced'`)
- **No customers at all**: email coverage stat hidden (new user)
- **All customers have email**: stat shows "50 of 50"
- **Email save fails on recurring_prompt**: try/catch — `createRecurringJob` still runs, email just isn't saved

### Integration Risk

- `CustomerDetails.tsx` onComplete type: adding optional field, existing callers unaffected (Low)
- `JobDetail/Home` recurring_prompt: must preserve existing interval buttons + callout charge guard (Medium)
- `CustomerDetail.tsx`: replacing display-only span with InlineEditRow (Low)
- `Reminders.tsx`: adding stat card (Low)

### Assumptions

1. Email is optional everywhere — merchant decides when to ask
2. No email validation in v1 — bounces handled by cron endpoint
3. Mode on recurring_prompt defaults to `'remind_me'` — safest, no surprise sends
4. Email field on recurring_prompt only shows when customer has no email
5. Coverage stat counts non-archived customers only
6. Branded emails (logo in email body) deferred to Sprint 3 — email template is default/fixed

### Out of Scope

- Branded email templates (logo, colours, HTML) — Sprint 3 Pro feature
- SMS via Twilio — Sprint 4
- WhatsApp Business API — Phase 4
- Email validation/regex — refinement
- Making email required on booking page — Sprint 3
- Template usage for manual WhatsApp sends — Sprint 2
- Bounce/failure surfacing — Sprint 2
- Deep-link from push — Sprint 2
- Per-job custom message — Sprint 3

---

## Sprint 2: Make the Feature Actually Work (✅ Shipped — commit 897a149, merged 55b34bf)

| # | Feature | Files | Effort |
|---|---------|-------|--------|
| 6 | Use `recurring_reminder` template for manual WhatsApp sends | `Home/index.tsx` | Cheap |
| 7 | Surface bounce/failure status in recurring_actions sheet | `Home/index.tsx` | Cheap |
| 8 | Recurring jobs display on CustomerDetail | `CustomerDetail.tsx` | Medium |
| 9 | Deep-link from push notification to recurring task card | `sw.ts`, `App.tsx`, `Home/index.tsx` | Medium |
| 10 | Customer has no phone guard on WhatsApp button | `Home/index.tsx` | Cheap |

## Sprint 3: Pro Upsell + Data Quality (✅ Shipped — commits d2875b9, b0b11e7)

| # | Feature | Files | Effort |
|---|---------|-------|--------|
| 11 | Branded reminder emails (Pro — logo only, default template) | `cron-recurring-reminders.js`, `entitlements.ts` | Medium |
| 12 | Reminder effectiveness insight on Dashboard | `insights.ts`, `Dashboard/index.tsx` | Medium |
| 13 | "No response after 3 reminders" → suggest phone call | `Home/index.tsx` | Cheap |
| 14 | Per-recurring-job custom message | `recurringJobs.ts`, `Home/index.tsx` | Medium |
| 15 | Booking page email required when booking_enabled | `functions/book/[[slug]].js` | Cheap |

## Sprint 4: Channel Alternatives (Partially Shipped — items 18-19 ✅, 16-17 skipped)

> **Items 18-19 shipped:** commit f69dcde
> **Items 16-17 skipped:** No user demand yet to justify external accounts (Twilio, WhatsApp Business API).

| # | Feature | Files | Effort |
|---|---------|-------|--------|
| 16 | SMS auto-send via Twilio | `cron-recurring-reminders.js`, new `smsConfig.ts` | High |
| 17 | WhatsApp Business API auto-send | New Function, Meta account | Very High |
| 18 | Quote follow-up email channel | `quoteFollowUp.ts`, cron endpoint | Medium |
| 19 | Payment chase email channel | `paymentChase.ts`, cron endpoint | Medium |

---

*Added: 2026-06-28*
*Author: Codex*

---

## Brainstorm: High-Impact Features Not in PRD (2026-06-28)

> **Method:** Audited every built feature + engine against the two personas'
> daily workflows. These 5 features connect existing engines to moments where
> the user needs them — no new infrastructure, no reinvented wheels.

### BR-1. Quick Requote from JobDetail

**Persona:** Both (Dave 5-10 quotes/week, Sophie rebooks similar services)
**Pain removed:** Dave finishes a boiler service for Mark. Three months later
Mark calls for another. Dave navigates to Jobs, finds the old job, tries to
remember what he charged, manually recreates each line item. 5 minutes per
repeat quote × 5-10/week = 25-50 min/week wasted.
**Solution:** On any completed/cancelled/written-off job detail page, add a
"Create similar quote" button. Tapping it navigates to QuoteBuilder with the
same customer + same line items pre-filled as a starting point. Dave adjusts
prices if needed and sends in 30 seconds.
**Leverages:** QuoteBuilder already accepts `jobId` via route state (used by
"Resend quote" from QuoteSent). Just add a button on non-quoted/non-booked
jobs that passes the old job's line items.
**Effort:** S
**Immediacy:** Felt on first repeat customer — saves 4 minutes instantly.

### BR-2. Outstanding Balance on JobCard

**Persona:** Dave (15-20 active jobs, late payers are his #1 pain)
**Pain removed:** Dave opens the Jobs page, sees 6 "Awaiting Payment" jobs.
He has to tap into each one to see who owes £450 vs who owes £25. He can't
prioritize chasing without opening every job.
**Solution:** On the JobCard component, when `status === 'awaiting_payment'`
and `amountDue > 0`, show a red "£X outstanding" badge below the job title.
Dave scans the list and knows instantly who to chase first.
**Leverages:** `paymentSummary()` in `paymentHelpers.ts` already computes
`amountDue`. `JobCard` already receives job + line items. `StatusBadge`
pattern already exists for coloured pills.
**Effort:** S
**Immediacy:** Felt on first glance at the Jobs list with any unpaid jobs.

### BR-3. Customer Merge Suggestion on New Quote

**Persona:** Both (Dave has 30-40 customers, Sophie has 50+)
**Pain removed:** Dave logs a missed call from "J Smith" and creates a new
customer. Two weeks later he realises "J Smith" is the same person as "John
Smith" he already has — now there are two records with split job history.
Over months, duplicate records make the CRM unreliable.
**Solution:** In QuoteBuilder, when the user enters a phone number, check
`findDuplicateByPhone()`. If a match is found, show a subtle banner: "This
looks like John Smith (3 jobs) — use existing record?" Tapping merges the
new quote into the existing customer instead of creating a duplicate.
**Leverages:** `findDuplicateByPhone()` in `customers.ts` already does phone
matching (used in booking accept flow). `mergeCustomers()` already exists.
Just wire the check into QuoteBuilder's phone input.
**Effort:** S-M
**Immediacy:** Felt on first duplicate — prevents data rot from day one.

### BR-4. Batch Quote Send

**Persona:** Dave (sends 5-10 quotes per session, often back-to-back)
**Pain removed:** Dave just finished quoting 5 jobs from missed calls. He
has to open each one, tap "Preview & Send", tap "Send via WhatsApp", repeat
5 times. It's tedious and he sometimes forgets to send one.
**Solution:** Add a "Select" mode to the Jobs list (long-press or a select
button). User selects multiple quoted jobs, taps "Send all via WhatsApp".
The app loops through each job, opening WhatsApp with the pre-filled message
for each. User confirms each send (WhatsApp deep-link requires manual
confirmation — can't bypass).
**Leverages:** QuoteBuilder + SendSheet already handle single sends. Template
engine personalises each message. Selection mode is a new UI pattern but
the send logic is all existing.
**Effort:** M
**Immediacy:** Felt on first multi-quote session — saves 2-3 minutes per
batch of 5.

### BR-5. Deposit Status Badge on JobCard

**Persona:** Sophie (deposit no-shows are her #1 pain, payment_terms =
'deposit')
**Pain removed:** Sophie opens Jobs, sees 3 "Booked" jobs. She doesn't know
which clients have paid their deposit vs which haven't. She might block off
a chair for someone who hasn't committed financially.
**Solution:** On JobCard, when `payment_terms === 'deposit'`, show a small
pill: green "Deposit paid" if `deposit_status === 'paid'`, amber "Deposit
due" if `deposit_status === 'requested'`, gray "No deposit" if
`deposit_status === 'none' or undefined`.
**Leverages:** `Job.deposit_status` field exists. `StatusBadge` + `JobCard`
components already render badges. Just add a conditional pill.
**Effort:** S
**Immediacy:** Felt on first glance at Jobs list with deposit-term jobs.

---

## Updated Priority — Remaining Items (2026-06-28)

### Items Removed from Priority List

| Item | Reason |
|------|--------|
| XU-10: Calendar ICS batch export | Reduces app engagement — Dave should live in Buildlogg, not his phone calendar. Per-job "Add to calendar" already exists on JobDetail. |
| XU-9: Voice input on expense + notes | Clutters UI, high error rate for numbers/amounts, typing is faster and more accurate for financial data. |

### Items Still Valid (ranked)

| # | Feature | Persona | Impact | Effort | Notes |
|---|---------|---------|--------|--------|-------|
| 1 | BR-1: Quick Requote from JobDetail | Both | Saves 4 min per repeat quote | S | Highest ROI — pure wiring of existing QuoteBuilder |
| 2 | BR-2: Outstanding balance on JobCard | Dave | Scan who owes what without opening each job | S | Single highest-friction gap on Jobs page |
| 3 | BR-5: Deposit status badge on JobCard | Sophie | Knows which clients are committed | S | Confidence before blocking a chair |
| 4 | BR-3: Customer merge suggestion on new quote | Both | Prevents CRM data rot | S-M | `findDuplicateByPhone` + `mergeCustomers` already exist |
| 5 | XU-3: Recurring jobs on CustomerDetail + Dashboard | Both | Sophie sees next service per client | S-M | CustomerDetail already loads recurring_jobs; Dashboard needs stat |
| 6 | XU-8: Scheduling conflicts in booking accept | Both | Full conflict detection (travel time + back-to-back) in accept flow | S-M | `detectConflicts()` exists; basic overlap already works via `checkBookingConflict` |
| 7 | BR-4: Batch quote send | Dave | Send 5 quotes in one batch | M | Needs selection mode UI; send logic is existing |
| 8 | W3-1: Smart reminders (auto-send) | Sophie | Automatic WhatsApp/SMS reminders | Very High | Needs WhatsApp Business API or Twilio — DEFERRED. Task-card-based reminders already live via cron Functions. |

### W3-1 Clarification: Auto-Send vs Task Cards

The existing cron Functions (`cron-recurring-reminders.js`,
`cron-quote-follow-ups.js`, `cron-payment-chases.js`) already generate
**task cards** on Home automatically. The user gets a reminder card, taps
"Send", and WhatsApp opens with a pre-filled message.

**True auto-send** (no user tap required) needs either:
- WhatsApp Business API — expensive, Meta approval, ToS restrictions (DEFERRED)
- SMS gateway (Twilio) — new 3rd party system, per-message cost

Without those APIs, the task-card-based reminder system is the practical
limit. It's already live and working.

---

*Added: 2026-06-28*
*Author: Codex*
