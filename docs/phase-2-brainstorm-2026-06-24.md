# Buildlogg Phase 2 — Feature Brainstorm

> **Date:** 2026-06-24
> **Method:** Merchant-first. Every feature starts from a use case Dave actually lives, not a competitor checklist.
> **Product thesis:** "Built for the job site. Not the office." Anti-overkill. One person working alone.
> ** gating principle:** Phase 2 features must solve a problem the merchant has *already hit* by the time Phase 1 is in daily use — not hypothetical future problems.

---

## How to Read This Document

Each feature is evaluated against four criteria:
- **User Pain** — What specific situation causes the pain? (use case)
- **Edge Cases** — What variations or exceptions does the merchant hit?
- **Impact** — How much money/time/trust does this save?
- **Build Cost** — Low / Medium / High

Features are grouped into **Impact Tiers**:
- 🔴 **Tier 1 — Revenue & Retention** (protects money or keeps users active)
- 🟡 **Tier 2 — Time & Professionalism** (saves time, builds trust)
- 🟢 **Tier 3 — Intelligence & Growth** (helps Dave understand/run his business)

---

## 🔴 TIER 1 — Revenue & Retention

### P2-01. Automated Quote Follow-Up

**User Pain:**
Dave sends a quote on Monday. The customer says "let me think about it." Dave means to follow up Thursday. He forgets. The following week he sees the WhatsApp thread — the customer went with someone else. Dave estimates he loses 2-3 jobs per month this way. That's £400-600 in lost revenue.

**Use Case:**
1. Dave sends a quote → app logs "quoted" state + timestamp
2. 48 hours pass, no response → app generates a task card: "Follow up with Sarah — quote sent 2 days ago"
3. Dave taps the card → pre-filled WhatsApp message: "Hi Sarah, just following up on the quote I sent Tuesday. Happy to answer any questions. — Dave"
4. Dave taps send. Task clears.

**Edge Cases:**
- Customer responds on WhatsApp but doesn't change the job state in the app → the app can't know the quote was acknowledged. Solution: Dave can manually mark "customer responded" or the follow-up task has a "skip" button.
- Dave sends the same quote to multiple contacts (e.g. landlord + tenant) → follow-up should track per-recipient, not per-job.
- Weekend jobs — follow-up timing should skip Sundays (configurable).
- Customer says "I'll get back to you next month" → Dave needs a "snooze follow-up" option (1 week, 2 weeks, custom date).

**Impact:** HIGH. Stale quotes are the #1 revenue leak for sole traders. The GTM strategy already flags this: "Stale · Xd" badges exist in the MVP, but there's no active nudge to act on them.

**Build Cost:** Low. The flag system already detects stale quotes. This adds a task card + a pre-filled WhatsApp deep link + a snooze mechanism.

---

### P2-02. Recurring / Repeat Job Reminders

**User Pain:**
Dave services the same boiler every year. He does it for 12 customers. He relies on the customer to call him. Half the time they forget — they use a different plumber. Dave loses £80 × 6 = £480/year in repeat business that should have been automatic.

**Use Case:**
1. Dave marks a job "Paid" → app shows a prompt: "Is this a recurring job?" with options: One-off / Annual / 6-monthly / Quarterly / Monthly
2. Dave taps "Annual" → app creates a reminder: "Service boiler at 12 High Street — due [next year]"
3. 2 weeks before the due date → task card appears: "Call Sarah about annual boiler service"
4. Dave calls → books the job → reminder resets for next year

**Edge Cases:**
- Customer moves house → reminder should be cancellable, and Dave should be prompted to ask "Do you have a new address?" rather than just deleting.
- Seasonal work (boiler service is autumn/winter, gutter clearing is autumn) → reminders should respect the season, not just the calendar date. Solution: allow Dave to set a "suggested month" for recurring jobs.
- Customer wants to change frequency → "Actually can you come every 6 months instead?" → edit the recurrence without recreating.
- Dave has 30+ recurring jobs → needs a "Upcoming recurring jobs" list view, not just task cards.
- No response from customer after 2 attempts → auto-silence the reminder and move to a "dormant recurring" list.

**Impact:** HIGH. This is annuity revenue with zero acquisition cost. For a tradesperson with 20 repeat customers at £80/job, that's £1,600/year preserved. It also deepens the customer relationship — "my plumber remembers my boiler" builds loyalty.

**Build Cost:** Medium. New `recurring_jobs` table, recurrence logic, reminder task generation, "upcoming recurring" list view, snooze/cancel flows.

---

### P2-03. Overdue Payment Escalation Ladder

**User Pain:**
Dave marks a job "Awaiting Payment." He sends a WhatsApp reminder. Nothing happens. He means to follow up but doesn't. Three months later, the invoice is still outstanding. He's embarrassed to chase it now. He writes it off. That's £200-400 lost per incident, 3-4 times a year.

**Use Case:**
1. Invoice overdue by 7 days → automatic gentle reminder (WhatsApp): "Hi John, just a friendly reminder about the £240 for the bathroom work. Let me know if you need to talk about payment timing. — Dave"
2. Overdue by 14 days → firmer reminder + offer to split: "Hi John, the balance of £240 is now 2 weeks overdue. Happy to set up a payment plan if that helps. — Dave"
3. Overdue by 30 days → "overdue" flag (already in MVP) + task card: "Call John about £240 — 30 days overdue"
4. Overdue by 60 days → final reminder + task card: "Consider small claims court for £240 — 60 days overdue"

**Edge Cases:**
- Customer disputes the invoice → Dave needs to pause the escalation ladder. "Pause chase" button with reason.
- Partial payment → ladder should track the remaining balance, not the original amount.
- Customer is a landlord with multiple properties → escalation should be per-job, not per-customer (don't threaten a landlord over one job while they're paying you for another).
- Dave doesn't want automated messages going out without his approval → configurable: "Auto-send reminders" vs "Draft them for me to review."
- WhatsApp delivery failure (number changed, no WhatsApp) → fall back to SMS deep link.
- Customer responds to the reminder → pause the ladder until Dave manually resumes.

**Impact:** HIGH. Outstanding invoices are the #2 revenue leak (after stale quotes). The MVP has flags but no escalation. This turns a passive badge into an active recovery process.

**Build Cost:** Medium. Escalation state machine, template messages per stage, pause/resume, configurable auto-send vs draft mode.

---

### P2-04. Deposit Collection at Booking

**User Pain:**
Dave books a big job (£800 bathroom fit). Customer cancels the day before. Dave has turned down other work for that slot. He has no deposit. He's lost £800 in opportunity cost plus the materials he already bought.

**Use Case:**
1. Dave taps "Mark as Booked" → app prompts: "Take a deposit for this job?"
2. Dave enters deposit amount (e.g. £100) → app generates a Stripe payment link
3. Dave sends the link via WhatsApp: "Hi Sarah, your booking is confirmed for Tuesday. Please pay the £100 deposit here: [link]"
4. Customer pays → app updates job status to "Booked + Deposit Paid"
5. If customer cancels < 24h → deposit is retained (policy shown in the payment link)

**Edge Cases:**
- Customer doesn't have a card / prefers cash → "Mark deposit as cash received" manual option.
- Customer refuses to pay deposit → Dave can skip, but app shows a warning: "No deposit held — no cancellation protection."
- Deposit amount vs total → deposit should be configurable (fixed amount, percentage, or custom).
- Refund processing → if Dave cancels (not the customer), he needs a "refund deposit" action.
- Partial deposit (customer pays £50 of £100) → track partial deposits like partial payments.
- Beauty/salon vertical: this is the core feature, not an add-on. The deposit flow must work for both "tradesperson booking a big job" and "salon taking a booking deposit."

**Impact:** HIGH. This is the bridge between Buildlogg (trades) and the beauty vertical. It directly prevents revenue loss from cancellations and positions Buildlogg as a booking tool, not just a quoting tool. This is also the Stripe integration the GTM strategy defers — but the beauty vertical makes it necessary sooner.

**Build Cost:** Medium-High. Stripe payment links API integration, payment status webhooks, deposit tracking in the job state machine, refund flow, policy display.

---

## 🟡 TIER 2 — Time & Professionalism

### P2-05. PDF Quote & Invoice Generation

**User Pain:**
Dave sends quotes via WhatsApp as text. They look informal. Customers sometimes don't take them seriously. When Dave sends a quote to a landlord or a small business, they ask for a "proper invoice" or a "PDF I can show my boss." Dave loses jobs to competitors who send professional-looking documents.

**Use Case:**
1. Dave builds a quote → taps "Share as PDF" alongside the existing WhatsApp/SMS options
2. App generates a branded PDF: business name, logo (Pro), quote number, date, itemised breakdown, total, validity period, T&Cs
3. PDF is saved to the job and shared via WhatsApp/Files/AirDrop
4. Customer receives a professional document, not a text message

**Edge Cases:**
- No logo (Free tier) → clean template with "Powered by Buildlogg" footer (viral loop from GTM §4)
- Quote modified after PDF sent → generate a new PDF with "Revised Quote v2" label, don't overwrite the original
- Customer wants an invoice, not a quote → separate invoice template with payment details, bank transfer info, due date
- VAT-registered tradesperson → needs VAT breakdown (20% VAT line + VAT registration number)
- Large quotes (20+ line items) → pagination, summary on first page, details on subsequent pages
- Dark mode print → PDF should always be light-mode regardless of app theme (printing on paper)

**Impact:** MEDIUM-HIGH. Professional documents win jobs. The GTM strategy identifies "looking professional" as a conversion trigger. This is also a Pro-tier differentiator (your logo vs Powered by Buildlogg).

**Build Cost:** Medium. jsPDF + jspdf-autotable, template design, logo upload, VAT support, quote/invoice variants. Existing `MVP-Implementation-Plan.md` estimates 2 days.

---

### P2-06. Smart Scheduling & Calendar View

**User Pain:**
Dave books jobs on different days. He writes them in a paper diary. He double-books himself because the app's job list doesn't show time conflicts. He drives 40 minutes to a job only to find he's already booked that morning. He loses the customer's trust and wastes fuel.

**Use Case:**
1. Dave taps "Schedule" tab → sees a week view with jobs plotted by time
2. New booking → app checks for conflicts: "You already have a job at 10am that day in Manchester. This one is in Stockport — 45 min drive. Want to keep both?"
3. Drag a job to reschedule → sync_queue updates the time
4. Day view shows drive time estimates between jobs (postcode-based, rough estimate)

**Edge Cases:**
- No scheduled time (many jobs are "sometime Tuesday") → unscheduled jobs appear in a sidebar "to slot in" list
- Customer changes time on the morning of → drag to move, app sends "Your appointment has been moved to 2pm" WhatsApp automatically (configurable)
- All-day jobs vs time-slotted → support both modes
- Multi-day jobs (bathroom refit = 3 days) → span across days in the calendar
- Seasonal busyness → calendar should handle 10+ jobs per day without becoming unreadable
- Beauty vertical: appointments are precise time slots, not "sometime Tuesday" — calendar must handle both paradigms

**Impact:** MEDIUM. Double-booking is embarrassing and expensive. But many sole traders manage with 3-5 jobs/week, so the pain scales with busyness. More valuable for beauty/salon where appointment slots are the unit of business.

**Build Cost:** Medium-High. Calendar component (custom or react-big-calendar), conflict detection, drag-to-reschedule, drive time estimation (optional, needs maps API), day/week views.

---

### P2-07. Customer Database & History

**User Pain:**
Dave gets a call from "John." He doesn't remember which John. Was it the boiler repair in Didsbury? Or the bathroom leak in Chorlton? He has to ask "which property was it again?" — looks unprofessional. He also can't quickly check "when did I last service John's boiler?" without scrolling through WhatsApp.

**Use Case:**
1. Dave starts typing a customer name in the quote builder → autocomplete shows: "John Smith — 12 High Street, Didsbury — 3 past jobs, last seen Jan 2026"
2. Dave taps the suggestion → all past jobs, quotes, payments, and notes for John load in a sidebar
3. Dave can see: total spent (£840), last job (boiler service), outstanding balance (£0), recurring job (annual boiler service due Oct 2026)

**Edge Cases:**
- Two customers named "John Smith" → disambiguate by address or phone number
- Customer changes address → update address, keep job history linked to the customer, not the address
- Customer with multiple properties (landlord) → one customer, multiple job addresses
- Business customers (landlord with 10 properties) → business name + contact person + multiple addresses
- Customer hasn't been seen in 2 years → archive but don't delete (GDPR: keep for tax purposes, but mark as inactive)
- Merge duplicates → Dave accidentally created two entries for the same person → merge flow

**Impact:** MEDIUM-HIGH. The MVP has "Customer History" in the quote builder (R14), but it's per-job, not a proper customer database. A real customer database enables: repeat job reminders (P2-02), targeted follow-up, and a professional "I remember you and your property" experience.

**Build Cost:** Medium. New `customers` table, migration from job-based customer data to customer-entity model, autocomplete UI, customer detail view, merge/deduplicate flow.

---

### P2-08. Customisable Message Templates

**User Pain:**
Dave types the same WhatsApp messages over and over: "Hi, I can come tomorrow at 10am" / "Your balance of £X is outstanding" / "Thanks for choosing Buildlogg, leave a review here: [link]." Each time he types it from memory, sometimes he forgets details, sometimes the tone varies.

**Use Case:**
1. Settings → Message Templates → Dave sees 5 default templates:
   - Booking confirmation
   - Day-before reminder
   - Invoice reminder
   - Follow-up (stale quote)
   - Review request
2. Dave edits the booking confirmation: "Hi {firstName}, your {jobTitle} is confirmed for {date} at {time}. I'll be at {address}. See you then! — {businessName}"
3. When sending a message from a job, Dave picks a template → auto-fills with job data → review and send

**Edge Cases:**
- Template references a field that's empty (no scheduled time) → show placeholder as "[time not set]" rather than sending a broken message
- Dave wants different templates for different trades (plumbing vs electrical) → trade-tagged templates
- Multi-language customers → templates in different languages (Polish, Romanian — common in UK trades)
- WhatsApp character limits → warn if template exceeds WhatsApp's text limit
- Legal: templates must not be marketing messages (PECR/GDPR from GTM §11) — only operational/service messages

**Impact:** MEDIUM. Saves 5-10 minutes per day of repetitive typing. More importantly, ensures consistent, professional communication. The review request template (when properly timed) drives Google reviews, which drive new business.

**Build Cost:** Low. New `message_templates` table, template editor, placeholder system, template picker in message flows. Existing `MVP-Implementation-Plan.md` estimates 1 day.

---

## 🟢 TIER 3 — Intelligence & Growth

### P2-09. Revenue & Business Dashboard

**User Pain:**
Dave doesn't know his numbers. "How much did I earn this month?" requires scrolling through WhatsApp payments and adding them up. "What's my win rate on quotes?" — he has no idea. "Which types of jobs make the most money?" — he thinks boiler repairs but isn't sure. He's running his business blind.

**Use Case:**
1. Dave opens the Dashboard → sees 4 cards:
   - **This Month:** £2,340 earned vs £3,100 quoted (75% conversion)
   - **Outstanding:** £480 awaiting payment across 3 jobs
   - **Win Rate:** 68% of quotes → booked (up from 60% last month)
   - **Top Job Type:** Boiler repairs (£890 this month, 4 jobs)
2. Dave taps "Top Job Type" → breakdown: boiler repair £890, bathroom £620, emergency callout £450, other £380
3. Dave taps "Outstanding" → jumps to the chase list

**Edge Cases:**
- First month of use → no historical comparison. Show "building your baseline" instead of trend lines.
- Cash payments not recorded in the app → dashboard should show "X jobs marked paid (cash)" vs "Y jobs marked paid (bank)" to highlight unrecorded income
- Seasonal variation → month-over-month comparison is misleading in trades (summer is slow for plumbers). Show rolling 3-month average alongside monthly figures.
- VAT-registered → show net vs gross separately
- Part-time sole traders (Dave does 2 days/week) → dashboard should reflect actual working days, not assume full-time
- Export → Dave's accountant wants a CSV/Excel of monthly earnings → export button

**Impact:** MEDIUM. Most sole traders don't know their numbers. The ones who do make better decisions (focus on profitable job types, chase outstanding payments, raise prices). This is also a retention feature — once Dave sees his business history in Buildlogg, leaving means losing his business intelligence.

**Build Cost:** Medium. Dashboard screen, aggregation queries on Dexie, simple charts (custom SVG or lightweight chart lib), caching, export.

---

### P2-10. Google Review Request

**User Pain:**
Dave does a great job. The customer is happy. Dave leaves. Neither thinks about a review. Dave has 3 Google reviews while his competitor has 47. He loses jobs because customers check Google before calling. He knows reviews matter but feels awkward asking.

**Use Case:**
1. Dave marks a job "Paid" → app prompts: "Ask Sarah for a Google review?"
2. Dave taps "Yes" → WhatsApp message: "Hi Sarah, glad the bathroom's sorted! If you were happy with the work, a quick Google review helps me a lot: [review link]. Only takes 30 seconds. Thanks! — Dave"
3. Dave taps send. The job gets a "review requested" badge.
4. If the customer leaves a review → Dave sees it in the dashboard: "New Google review from Sarah ★★★★★"

**Edge Cases:**
- Customer doesn't have a Google account → the link still works (Google allows reviews with any email), but the friction is higher. Alternative: "recommend me on Facebook" link as fallback.
- Job went poorly → Dave should NOT send a review request. The prompt should have a "skip" option that doesn't feel like a failure.
- Review link needs a Google Business Profile → Dave needs to set this up in Settings (one-time setup: enter Google Business URL or search for business name).
- Timing → review requests sent immediately after payment get higher response rates than ones sent days later.
- Dave has multiple Google Business locations → pick the right one per job address (rare for sole traders but possible).
- Regulatory: some trades (Gas Safe) have specific review rules → not a blocker, but note.

**Impact:** MEDIUM-HIGH. Google reviews are the #1 driver of inbound leads for local trades. 10+ reviews with 4.5★ rating puts Dave in the "trustworthy" tier on Google Maps. This turns Buildlogg from an admin tool into a growth tool.

**Build Cost:** Low-Medium. Google review link generation (short link to Google Business review page), one-time Google Business setup in Settings, "review requested" badge, WhatsApp template.

---

### P2-11. Material Price Tracking & Supplier Price Comparison

**User Pain:**
Dave buys a Worcester Bosch boiler from Screwfix for £850. He sees it at Toolstation the next week for £790. He's been overpaying for months because he always goes to the same supplier out of habit. He doesn't track material costs per job, so he doesn't know if his pricing is profitable.

**Use Case:**
1. Dave adds a material to a job: "Worcester Bosch 30kW combi — £850 — Screwfix"
2. App logs: material name, price, supplier, date
3. Next time Dave adds the same material → app shows: "Last bought: £850 (Screwfix, 3 months ago). Average price: £820 across 4 purchases."
4. Optional: "Check Toolstation" link → opens Toolstation search for the same product

**Edge Cases:**
- Material prices fluctuate (copper pipe, gas) → show trend, not just average
- Dave buys from independent merchants, not just Screwfix/Toolstation → manual supplier entry
- Bulk discounts (buy 10 radiators, get 15% off) → track unit price, not just total
- Same product, different model numbers (Worcester Bosch 30kW vs 30kW Compact) → fuzzy matching or manual linking
- Dave doesn't always scan receipts → manual entry is the primary input, receipt scanning is a future enhancement
- No API integration with suppliers → this is a manual tracking tool, not an automated price comparison. The value is in Dave seeing his own purchasing patterns.

**Impact:** LOW-MEDIUM. Material costs are 30-50% of a tradesperson's revenue. Even a 5% saving on materials is significant. But the pain isn't acute — Dave doesn't feel it daily. It's a slow drip.

**Build Cost:** Medium. Material price history table, per-material average/trend, supplier tagging, price comparison links (open external search). The MVP already has Materials Inventory (R19) — this extends it with price history.

---

### P2-12. Referral & Word-of-Mouth Engine

**User Pain:**
Dave's customers recommend him to their friends and neighbours. But the recommendation happens in conversation, and Dave has no way to capture or amplify it. He doesn't know which customers are referring him. He can't systematically ask for referrals. Word-of-mouth is his best channel but it's completely passive.

**Use Case:**
1. After a job is paid + review requested → app shows: "Know someone who needs a good plumber? Share your card."
2. Dave taps → generates a shareable link: buildlogg.com/dave-plumbing (or a vCard with contact details)
3. Customer shares the link with a neighbour → neighbour taps → sees Dave's profile (trade, area, reviews, WhatsApp button)
4. If the neighbour signs up for a quote → Dave gets a notification: "New enquiry from Sarah's referral"

**Edge Cases:**
- Dave doesn't want a public profile → the share link can be a simple vCard (contact card) instead of a web page
- Referral tracking → "How did you hear about me?" dropdown in the enquiry flow with "Recommended by [name]" option
- Privacy → the customer's name should not appear on the shared link without their consent
- Abuse → someone shares the link in a trades Facebook group → Dave could get spam enquiries. Solution: rate-limit or require a phone number for enquiry.
- Pro-tier feature → referral engine could be a Pro perk (free tier gets vCard sharing, Pro gets the tracked referral page)

**Impact:** MEDIUM. The GTM strategy (§5 Channel 6) identifies word-of-mouth as "the big one." This systematizes it. But the impact is indirect — it amplifies an existing channel rather than creating a new one.

**Build Cost:** Medium. Shareable profile page (static, Cloudflare Pages), vCard generation, referral tracking in enquiry flow, "how did you hear" source attribution.

---

## Summary — Priority Matrix

| ID | Feature | Tier | Impact | Build Cost | Vertical Bridge |
|----|---------|------|--------|------------|-----------------|
| P2-01 | Automated Quote Follow-Up | 🔴 Revenue | HIGH | Low | Both |
| P2-02 | Recurring Job Reminders | 🔴 Revenue | HIGH | Medium | Both |
| P2-03 | Overdue Payment Escalation | 🔴 Revenue | HIGH | Medium | Both |
| P2-04 | Deposit Collection at Booking | 🔴 Revenue | HIGH | Med-High | Beauty core |
| P2-05 | PDF Quote & Invoice | 🟡 Professional | MED-HIGH | Medium | Both |
| P2-06 | Smart Scheduling & Calendar | 🟡 Time | MEDIUM | Med-High | Beauty core |
| P2-07 | Customer Database & History | 🟡 Professional | MED-HIGH | Medium | Both |
| P2-08 | Customisable Message Templates | 🟡 Time | MEDIUM | Low | Both |
| P2-09 | Revenue & Business Dashboard | 🟢 Intelligence | MEDIUM | Medium | Both |
| P2-10 | Google Review Request | 🟢 Growth | MED-HIGH | Low-Med | Both |
| P2-11 | Material Price Tracking | 🟢 Intelligence | LOW-MED | Medium | Trades only |
| P2-12 | Referral & Word-of-Mouth Engine | 🟢 Growth | MEDIUM | Medium | Both |

---

## Recommended Build Order

### Wave 1 — Revenue Protection (Week 1-2)
**P2-01 (Quote Follow-Up) → P2-03 (Payment Escalation) → P2-02 (Recurring Reminders)**

All three address active revenue leaks. P2-01 is lowest cost / highest impact. These work with existing data — no new integrations needed.

### Wave 2 — Professionalism & Trust (Week 3-4)
**P2-05 (PDF) → P2-08 (Message Templates) → P2-07 (Customer Database)**

PDF + templates make Dave look professional. Customer database is the foundation for recurring reminders and referral tracking.

### Wave 3 — Booking & Deposits (Week 5-6)
**P2-04 (Deposits) → P2-06 (Scheduling)**

Deposits require Stripe but unlock the beauty vertical. Scheduling becomes more important as job volume grows and as beauty appointments need precise time slots.

### Wave 4 — Intelligence & Growth (Week 7-8)
**P2-09 (Dashboard) → P2-10 (Google Reviews) → P2-12 (Referrals)**

These are retention and growth features. They turn Buildlogg from an admin tool into a business intelligence platform. Dave sees his numbers, builds his online reputation, and systematizes word-of-mouth.

### Deferred
**P2-11 (Material Price Tracking)** — useful but not urgent. Build after core revenue and professionalism features are shipped.

---

## Cross-Vertical Considerations

Buildlogg is expanding into beauty/salon. Several Phase 2 features have different meanings in that context:

| Feature | Trades (Dave) | Beauty (Sophie) |
|---------|---------------|-----------------|
| Deposits (P2-04) | Big job protection | Core booking mechanic |
| Scheduling (P2-06) | Rough time slots | Precise appointment slots |
| Recurring (P2-02) | Annual boiler service | 4-weekly nail refill |
| Follow-up (P2-01) | Stale quote chase | Booking confirmation |
| Templates (P2-08) | Invoice reminders | Appointment reminders |
| Reviews (P2-10) | Google reviews | Google + Instagram |

The beauty vertical makes deposits and scheduling more urgent than they would be for trades alone.

---

## What's Deliberately NOT Here

| Feature | Why Not |
|---------|---------|
| Stripe full payment processing | GTM §4 deprioritises — different product, compliance burden. Deposits (P2-04) are the minimal viable Stripe integration. |
| CIS tax tracking | Niche (construction only), complex, post-PMF. Accountant export (P2-09 dashboard export) covers the 80% case. |
| Open Banking integration | Phase 3 per MASTER-PRD. High compliance, low urgency. |
| Voice-to-quote | Phase 3. Voice-to-text (R4) already shipped. Full voice-to-quote needs LLM integration. |
| Subcontractor coordination | Solo trader product. Multi-person is a different thesis. |
| Jobs board / lead generation | Explicitly rejected in GTM §12. Breaks positioning. |
| Multi-device real-time sync | Cloud sync (R15) is in the existing Phase 2 list but deferred here — it's infrastructure, not a user-facing feature. Should be built silently as part of the Supabase backend evolution. |

---

*Brainstorm date: 2026-06-24*
*Author: Hermes (Lumos)*
*Next step: Review with user, prioritise, then spec individual features*
