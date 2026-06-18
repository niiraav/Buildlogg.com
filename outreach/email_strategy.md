# Buildlogg Outreach Email Strategy — Revised

## Positioning
Buildlogg is live. Outreach is **early access for tradespeople who want to cut the late-night admin** — not a beta test. Every email points to a 60-second demo or a trade-specific landing page so the product does the persuading.

## ICP (from lead file)
- 8,962 suitable trade leads
- 5,827 business emails, 3,135 personal emails
- Top trades: plumbing, electrical, flooring, waste management, cleaning, landscaping, roofing, glazing, kitchen design, builders merchant
- 3,304 have phone numbers (follow-up channel)
- 2,688 score ≥ 80, 1,610 at 70–79

## Segmentation
Split by **trade** first, then by score and email type. A plumber’s pain language is different from a roofer’s or a cleaner’s.

| Segment | Criteria | Approx. count | Approach |
|---|---|---|---|
| A1 — High-fit business | Score ≥ 70, business email | ~3,500 | Direct, professional. Demo CTA. |
| A2 — High-fit personal | Score ≥ 70, personal email | ~1,800 | Personal, founder-led. Demo CTA. |
| B1 — Medium-fit business | Score 50–69, business email | ~2,000 | Problem-focused. Workflow demo CTA. |
| B2 — Medium-fit personal | Score 50–69, personal email | ~1,000 | Casual, pain-point led. Demo CTA. |
| C — Low-fit | Score < 50 | ~949 | Skip. Protect deliverability. |

## Sequence (4 emails, 14 days + WhatsApp)
Send Tuesday–Thursday, 9–11am UK time. One CTA per email. No reply-first mechanics.

| Step | Day | Channel | Purpose | CTA |
|---|---|---|---|---|
| 1 — Problem hook | 0 | Email | “Late-night admin” pain | Watch 60-sec demo for [trade] |
| 2 — Workflow walkthrough | 3 | Email | Quote → book → paid on mobile | Book a 10-min demo |
| WhatsApp/SMS | 4 | Phone | Short founder follow-up (phone leads only) | Book or reply stop |
| 3 — Objection handling | 7 | Email | Address “I already use X / too busy / not techy” | See the comparison / book demo |
| 4 — Breakup | 14 | Email | Last chance, direct ask | Reply yes or no |

## Email 1 — Problem Hook
**Subject:** The admin you do at 9pm

Hi [first name],

Most [trade] owners we speak to do quotes, chase payments and reshuffle jobs between 9pm and midnight — because the day is spent on site.

Buildlogg is built to kill that. It runs the whole job from your phone: quote → approved → booked → paid. Offline when signal is bad. Fast when you’re in the van.

See how it works for a [trade] in 60 seconds: [loom/demo link by trade]

[Name]  
Founder, Buildlogg

---

## Email 2 — Workflow Walkthrough
**Subject:** How do you send a quote right now?

Hi [first name],

Quick question: how do you currently send a quote and take payment?

If it’s Word docs, WhatsApp, bank transfers and chasing — this is what Buildlogg replaces in one mobile flow:

1. Send a professional quote in under a minute
2. Customer approves and books a slot online
3. Invoice and take card payment when the job’s done
4. Everything stays in your pocket, even offline on site

No laptop. No desk. No 9pm admin.

Book a 10-min demo: [calendar link]

[Name]

---

## WhatsApp / SMS — Day 4 (phone leads only)
Send to A1 + A2 leads with phone numbers, 11am UK time.

> Hi [first name], it’s [Name] from Buildlogg. I emailed about cutting the late-night admin for [trade]s. Worth a 10-min call this week? [calendar link] — reply STOP to opt out.

---

## Email 3 — Objection Handling
**Subject:** “I already use X” — fair. Here’s the difference.

Hi [first name],

The most common reply we get is: *“I already use Checkatrade / Tradify / QuickBooks.”*

Fair — those tools handle parts of the job. Buildlogg is different because it keeps the whole job in one mobile workflow:

- One place for quote, schedule, invoice and payment
- Built for van and site use, not a desk
- Works offline when signal drops
- Customer approves and pays on their phone — no chasing

If that sounds different from what you’re using, book a 10-min demo: [calendar link]

[Name]

---

## Email 4 — Breakup
**Subject:** Last email from me

Hi [first name],

I’ve emailed a few times about Buildlogg and I don’t want to spam you.

If you’re not interested, reply “no thanks” and I’ll stop.

If late-night admin is still eating your evenings, reply “yes” and I’ll send a 60-second demo tailored to [trade].

[Name]

---

## A/B Tests to Run
| Test | Variant A | Variant B |
|---|---|---|
| Subject line | “The admin you do at 9pm” | “Still doing quotes at 9pm?” |
| CTA | Watch 60-sec demo | Book 10-min demo |
| Sender | Founder name | Buildlogg team |
| Personalisation | Trade only | Trade + area |
| Breakup subject | “Last email from me” | “Should I close your file?” |

## Metrics & Targets
Focus on **demo booking rate** and **reply quality**, not just opens.

| Metric | Target | Review at |
|---|---|---|
| Deliverability / bounce | < 3% | 500 sends |
| Spam placement | < 5% | 500 sends |
| Open rate | > 25% | 1,000 sends |
| Demo booking rate | > 3% | 1,000 sends |
| Reply rate | > 5% | 1,000 sends |
| Unsubscribe | < 1% | 1,000 sends |
| WhatsApp/SMS reply | > 10% | 200 sends |

## Compliance & Sending Setup
- **Sender:** founder@nirav.work (already configured via Mailgun)
- **Unsubscribe:** one-click link + list-unsubscribe headers + STOP for SMS
- **GDPR:** legitimate interest basis, clear opt-out, suppression list
- **Warm-up:** 50–100/day for 3 days, then scale to 300–500/day
- **Domain health:** DKIM/SPF set on nirav.work; monitor spam complaint rate

## Tools & Files
- Lead file: `outreach/tradepad_all_trade_leads_sending.csv`
- Existing cold-email sender: `lead-triage/src/scripts/send-cold-emails.ts`
- Mailgun config: `lead-triage/.env` (MAILGUN_API_KEY, MAILGUN_DOMAIN, FROM_EMAIL)

## Critical Dependencies Before Launch
1. **Demo/landing page:** Every email points here. If it’s weak, the sequence fails. Build a trade-specific landing page or 60-sec Loom for each top trade.
2. **Phone follow-up:** WhatsApp/SMS script and sender number/account.
3. **Calendar link:** 10-min demo booking link.

## Next Steps
1. Approve the revised 4-email sequence + early-access positioning
2. Create 1–2 trade-specific 60-second demos or landing pages (start with plumbing / electrical / roofing)
3. Set up WhatsApp/SMS sender
4. Build the sending script with batching, throttling, trade segmentation and unsubscribe tracking
5. Launch A1 test batch (100–200 high-fit business leads)
6. Review metrics after 1 week and iterate
