# 📧 Outreach Metrics — 2026-06-27

> Manual snapshot — generated from Resend API + Supabase. 11:00 BST.

## 🎯 Executive Summary

395 campaign emails sent across 4 days. 0 campaign sends Today (Jun 27). 200 Trades Leads Are Eligible For Step 2 Follow-ups (Overdue since Jun 25).

## 📊 Verified Numbers (from Resend API + Supabase)

### Total Sends

| Source | Count |
|--------|-------|
| Resend API (all emails) | 400 |
| Resend API (campaign emails only) | 395 |
| Supabase `cold_email_sends` (status=sent) | 400 |
| Non-campaign (password resets, test sends) | 5 |

### Campaign Sends by Date (from Resend API)

| Date | Sends | Vertical |
|------|-------|----------|
| 2026-06-23 | 61 | Trades (step 1) |
| 2026-06-24 | 106 | Trades (step 1) |
| 2026-06-25 | 100 | Beauty (step 1) |
| 2026-06-26 | 126 | Beauty (step 1) |
| 2026-06-27 | 2 | Test sends (quota checks — not campaign) |
| **Total campaign** | **395** | |

### Supabase State

| Status | Count |
|--------|-------|
| step 1 / sent / trades | 200 |
| step 1 / sent / beauty | 194 |
| step 1 / bounced / beauty | 6 |
| **Total in sequence** | **400** |

### Suppressions

| Reason | Count |
|--------|-------|
| Total suppressed | 27 |

## 🔋 Resend Free Tier Quota (as of 11:01 BST, Jun 27)

| Limit | Value | Notes |
|-------|-------|-------|
| Daily quota remaining | **7** | After 3 test sends today (quota check + delivery check + header check) |
| Monthly quota remaining | **566** | Free tier = 3,000/month. ~2,434 used this month. |
| Rate limit | 10/sec | Not a constraint for cold email batches |

**Note:** The 3 test sends today (to resend.dev test addresses) consumed 3 daily quota. No campaign emails sent today. Effective remaining for campaign: **7 sends today, 566 this month.**

## ⚡ Actions Needed

- **Step 2 is overdue.** 200 trades leads received step 1 on Jun 22–23. Step 2 fires on Day 3 (Jun 25–26). These are now 4–5 days overdue.
- **v11 template has never been sent to real leads.** All 395 campaign emails used v1 (broken template, non-clickable links). The v11 branded template is ready but only sent as test emails.
- **Beauty step 2 approaching.** 194 beauty leads sent step 1 on Jun 25–26. Step 2 eligible Jun 28–29.

## 📋 Recommended Batch for Today

With 7 daily sends remaining and 566 monthly remaining:

### Priority 1: v11 Template Validation (5–7 sends)
Send step 1 to 5–7 fresh beauty leads using the v11 branded template.
- Use best-performing subject variant B: "Quick question about your bookings"
- High-score leads (score = 100) that haven't been contacted
- This is the first production test of the branded design with working CTA links
- Compare open/click rates against the 395 v1 sends after 48h

### Priority 2: Step 2 Follow-ups (Tomorrow, Jun 28)
200 trades leads are eligible for step 2 NOW. Send when daily quota resets:
```bash
cd ~/lead-triage && npx tsx src/scripts/send-cold-emails.ts send 1 --vertical=trades
# Wait — that's step 1. For step 2:
cd ~/lead-triage && npx tsx src/scripts/send-cold-emails.ts send 2 --vertical=trades
```

## By Subject (from Resend API — all campaign sends)

| Count | Subject |
|-------|---------|
| 96 | The admin you do at 9pm |
| 82 | Quick question about your bookings |
| 81 | How many no-shows this week? |
| 55 | Beauty clients who don't show up |
| 33 | Quick question about your quotes |
| 7 | Waste management quotes from your phone? |
| 6 | Salon clients who don't show up |
| 4 | Plumbing quotes from your phone? |
| 3 | Barber clients who don't show up |
| 3 | Flooring quotes from your phone? |
| 2 | Hair clients who don't show up |
| 2 | Electrical quotes from your phone? |
| 2 | Fencing quotes from your phone? |
| 2 | Builders merchant quotes from your phone? |
| 2 | Landscaping quotes from your phone? |
| 2 | Heating quotes from your phone? |
| 1 each | Dry cleaning, Window installation, Scaffolding, Building, Window tinting, Roofing, Property repair, Insulation, Maintenance |

## Notes

- Previous metrics logs (Jun 22–26) reported "300 emails sent" — this was based on Supabase counts available at the time. The actual Resend API count is 395 campaign emails + 5 non-campaign = 400 total.
- The Supabase URL in `.env` is correct (`https://vwanxorcmyzfxumhyvxl.supabase.co`). Earlier connection failures were caused by dotenvx env masking in the terminal, not a misconfigured URL.
- 3 test sends to `resend.dev` addresses today consumed 3 daily quota slots. These are not campaign emails.
