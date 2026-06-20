# Buildlogg Outreach Email Strategy — v2

## Positioning
Buildlogg is live. Outreach is **early access for tradespeople who want to cut the late-night admin** — not a beta test. Every email points to the product landing page (`buildlogg.com/#how`) which visually demonstrates the quote → book → paid flow.

## Sender Identity
- **From name:** Buildlogg (no personal name)
- **From email: team@mail.buildlogg.com (Resend, mail.buildlogg.com verified)
- **Future:** Set up `mail.buildlogg.com` subdomain with its own DKIM/SPF
- **Sign-off:** "The Buildlogg team"

## ICP (from lead file)
- 8,962 total leads in CSV
- 4,285 qualified (score ≥ 70): 3,581 business emails, 704 personal emails
- Top trades: plumbing (685), electrical (600), flooring (458), waste management (446), cleaning (364+128), landscaping (294), roofing (258), glazing (198)
- 3,317 have phone numbers (not used for cold outreach — see Compliance)

## Segmentation
Split by **trade** first, then by score. All outreach is score ≥ 70 only.

| Segment | Criteria | Count | Approach |
|---|---|---|---|
| A — High-fit | Score ≥ 70 | ~4,285 | Direct, professional. Product demo CTA. |
| B — Low-fit | Score < 70 | ~4,677 | **Skip.** Protect deliverability. |

## Sequence (4 emails, 14 days)
Send Tuesday–Thursday. **7:00am or 12:30pm UK time** (before site / lunch break). One CTA per email. No reply-first mechanics. No WhatsApp/SMS for cold outreach.

| Step | Day | Purpose | CTA |
|---|---|---|---|
| 1 — Problem hook | 0 | "Late-night admin" pain | Watch 60-sec demo: buildlogg.com/#how |
| 2 — Workflow walkthrough | 3 | Quote → book → paid on mobile | See the full flow: buildlogg.com/#how |
| 3 — Objection handling | 7 | Address "I already use X" | See the difference: buildlogg.com/#how |
| 4 — Breakup | 14 | Last chance, direct ask | Reply yes or no |

## Email Copy

### Email 1 — Problem Hook
**Subject:** The admin you do at 9pm

Hi [first name],

Most [trade] owners do quotes, chase payments and reshuffle jobs between 9pm and midnight — because the day is spent on site.

Buildlogg is built to eliminate that. It runs the whole job from your phone: quote → approved → booked → paid. Offline when signal is bad. Fast when you're in the van.

See how it works for a [trade] in 60 seconds: https://buildlogg.com/#how

The Buildlogg team
buildlogg.com

---

### Email 2 — Workflow Walkthrough
**Subject:** How do you send a quote right now?

Hi [first name],

Quick question: how do you currently send a quote and take payment?

If it's Word docs, WhatsApp, bank transfers and chasing — this is what Buildlogg replaces in one mobile flow:

1. Send a professional quote in under a minute
2. Customer approves and books a slot online
3. Invoice and take payment when the job's done
4. Everything stays in your pocket, even offline on site

No laptop, no desk, no 9pm catch-up.

See the full flow: https://buildlogg.com/#how

The Buildlogg team
buildlogg.com

---

### Email 3 — Objection Handling
**Subject:** Built for the van, not the desk

Hi [first name],

The most common thing we hear: "I already use a directory or accounting tool."

Those tools are built for desks. Buildlogg is built for the van:

- One place for quote, schedule, invoice and payment
- Built for site use, not a laptop
- Works offline when signal drops
- Customer approves and pays on their phone — no chasing

See the difference in 60 seconds: https://buildlogg.com/#how

The Buildlogg team
buildlogg.com

---

### Email 4 — Breakup
**Subject:** Last email from me

Hi [first name],

I've emailed a few times about Buildlogg and I don't want to spam you.

If you're not interested, reply "no thanks" and I'll stop.

If late-night admin is still eating your evenings, reply "yes" and I'll send you a direct link to try it: https://buildlogg.com

The Buildlogg team
buildlogg.com

---

### Compliance Footer (all emails)
```
---
You received this email because you run a [trade] business in the UK.
To stop receiving emails, click here: [UNSUBSCRIBE_URL]
Buildlogg, 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ
```

## A/B Tests to Run
| Test | Variant A | Variant B |
|---|---|---|
| Subject line (email 1) | "The admin you do at 9pm" | "Still doing quotes at 9pm?" |
| CTA | Watch 60-sec demo | See how it works |
| Sender name | Buildlogg | Buildlogg team |
| Breakup subject | "Last email from me" | "Should I close your file?" |

## Metrics & Targets
| Metric | Target | Review at |
|---|---|---|
| Deliverability / bounce | < 3% | 500 sends |
| Spam placement | < 5% | 500 sends |
| Open rate | > 25% | 1,000 sends |
| Click-through (to buildlogg.com) | > 5% | 1,000 sends |
| Reply rate | > 5% | 1,000 sends |
| Unsubscribe | < 1% | 1,000 sends |

## Compliance & Sending Setup
- **Sender:** `team@nirav.work` via Mailgun (SPF/DKIM configured)
- **From name:** Buildlogg (no personal identity)
- **Unsubscribe:** one-click link + `List-Unsubscribe` + `List-Unsubscribe-Post` headers + suppression table in Supabase
- **GDPR:** legitimate interest basis, clear opt-out, suppression list, business address in footer
- **No WhatsApp/SMS** for cold outreach (WhatsApp ToS requires opt-in; SMS risks under PECR for cold prospects)
- **Reply detection:** Monitor inbox daily; mark replied leads in Supabase to stop sequence. Future: Mailgun webhook → Supabase.

## Warm-up Schedule
Conservative ramp to protect sender reputation:

| Days | Daily sends | Cumulative |
|---|---|---|
| 1–2 | 30 | 60 |
| 3–4 | 75 | 210 |
| 5–6 | 150 | 510 |
| 7+ | 250 max | — |

At 250/day max, 4,285 qualified leads = ~17 sending days for step 1.

## Sending Times
- **Tuesday, Wednesday, Thursday only**
- **7:00am UK** (before leaving for site) or **12:30pm UK** (lunch break)
- **Never** Monday (catch-up), Friday (winding down), or 9–11am (peak on-site)

## Tools & Files
- Lead file: `outreach/tradepad_all_trade_leads_sending.csv`
- Email templates: `lead-triage/src/lib/email-templates.ts`
- Sending script: `lead-triage/src/scripts/send-cold-emails.ts`
- Supabase schema: `outreach/supabase_schema.sql`
- Mailgun config: `lead-triage/.env` (MAILGUN_API_KEY, MAILGUN_DOMAIN, FROM_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_KEY)

## Supabase Tables (see `supabase_schema.sql`)
1. `email_suppressions` — emails that should never receive outreach
2. `cold_email_state` — per-lead sequence tracking (step, status, last_sent_at)
3. `cold_email_sends` — log of every email sent
4. `cold_email_stats` — view for quick stats

## Critical Dependencies Before Launch
1. ✅ **Demo/landing page:** `buildlogg.com/#how` shows the product flow visually
2. ✅ **Compliance:** unsubscribe link, List-Unsubscribe headers, suppression table, business address
3. ✅ **Sequence tracking:** per-lead state in Supabase (no blasting same person 4x)
4. ✅ **Templates:** rewritten with Buildlogg branding, no personal identity
5. ⬜ **Run SQL schema** in Supabase to create tables
6. ⬜ **Test dry run:** `DRY_RUN=true npx tsx src/scripts/send-cold-emails.ts preview 1`
7. ⬜ **Send test email:** `DRY_RUN=true npx tsx src/scripts/send-cold-emails.ts test`
8. ⬜ **Launch step 1:** `npx tsx src/scripts/send-cold-emails.ts send 1`

## Next Steps
1. Run `supabase_schema.sql` in Supabase SQL Editor
2. Dry-run preview: `DRY_RUN=true npx tsx src/scripts/send-cold-emails.ts preview 1`
3. Test email: `DRY_RUN=true npx tsx src/scripts/send-cold-emails.ts test`
4. Launch step 1 with 30 leads (day 1 of warm-up)
5. Check stats next day: `npx tsx src/scripts/send-cold-emails.ts stats`
6. Send step 1 to next batch (day 2: 30 more)
7. After 3 days, start sending step 2 to those who received step 1
8. Review metrics after 500 sends and iterate
