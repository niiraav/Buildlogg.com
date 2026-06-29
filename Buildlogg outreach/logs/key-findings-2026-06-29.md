# Outreach Campaign Key Findings — 2026-06-29

> For the next agent picking up the Buildlogg outreach campaign.
> Source data: 779 Resend events scanned, DNS verified, Supabase state reviewed.

## 1. Campaign Health — Better Than Reported

Actual Resend event breakdown (779 total emails):

| Event | Count | Rate |
|-------|-------|------|
| delivered | 691 | 88.7% |
| clicked | 58 | 7.4% |
| bounced | 30 | 3.9% |

Real delivery rate: **92.3%** (691 of 749 non-bounced). The 79.7% in earlier Telegram summaries was a timing artefact — the 06-28 metrics run had 144 "unknown" emails from same-day sends that have since resolved to delivered.

Bounces: All 14 beauty vertical, all personal addresses (Gmail/iCloud/Yahoo). Scraped lead data quality, not sender reputation.

Suppression list: 28 total — 21 unsubscribe_link, 4 manual (bounced), 1 signed_up (Omar), 2 other.

## 2. DNS / Deliverability Status

| Record | Value | Status |
|--------|-------|--------|
| SPF (mail.buildlogg.com) | `v=spf1 include:amazonses.com ~all` | ✅ Resend via AWS SES included |
| DKIM (resend._domainkey) | RSA public key | ✅ Working |
| DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@buildlogg.com` | ⚠️ Monitor only — no enforcement |
| MX | Cloudflare Email Routing | ✅ |

DMARC aggregate reports are arriving from Google and Microsoft — system is working. See `logs/dmarc-report-2026-06-29.md` for details.

**Inbound replies:** Cloudflare Email Routing handles MX but there's no IMAP inbox configured. Resend only tracks outbound events. To read reply content, check wherever Cloudflare Email Routing forwards `team@mail.buildlogg.com` (likely a personal Gmail).

## 3. Subject Line Performance — Step 2 Is Winning

### Step 1 — Trades

| Subject | Sent | Clicked | Click Rate | Verdict |
|---------|------|---------|------------|---------|
| "The admin you do at 9pm" | 139 | 2 | 1.4% | ❌ Kill — worst performer, highest volume |
| "Quick question about your quotes" | 35 | 4 | 11.4% | ⭐ Best Step 1 |
| "Saw your [trade] business" | 102 | 1 | ~1% | ❌ Weak |

### Step 1 — Beauty

| Subject | Sent | Clicked | Click Rate | Verdict |
|---------|------|---------|------------|---------|
| "Quick question about your bookings" | 120 | 6 | 5.0% | ⭐ Best beauty Step 1 |
| "How many no-shows this week?" | 81 | 2 | 2.5% | OK |
| "Your empty chair is costing you" | 33 | 0 | 0% | ❌ Kill |
| "[Company] — deposits for no-shows?" | 55 | 1 | ~1.8% | Weak |
| "Beauty/Salon/Barber clients who don't show up" | 64 | 1 | ~1.6% | Weak |

### Step 2 — Trades (clear winners)

| Subject | Sent | Clicked | Click Rate | Verdict |
|---------|------|---------|------------|---------|
| "How do you send quotes right now?" | 50 | 24 | **48%** | 🔥 Exceptional |
| "The quote-to-payment flow" | 50 | 16 | **32%** | Strong |

### Key insight

Step 2 massively outperforms Step 1. "How do you send quotes right now?" at 48% click rate is exceptional — the question format works. Step 1's best is 11.4% ("Quick question about your quotes"), and the highest-volume Step 1 subject ("The admin you do at 9pm" at 139 sends) is the worst at 1.4%.

**Action:** Kill "The admin you do at 9pm" and "Your empty chair is costing you". Use question-format subjects for all new Step 1 sends.

## 4. First Sign-Up — Omar Qoraan

- **Who:** Omar Qoraan, King Turkish Barber (Glasgow)
- **Email:** quraan6060@gmail.com
- **Subject:** "Quick question about your bookings" (Beauty, Step 1, Variant A)
- **Timeline:** Sent 17:46 → clicked → signed up → suppressed by 18:01 (15 min)
- **Funnel:** Cold email → click → landing page → sign up → email confirmed. All within 3 minutes.
- **Reply text:** Not retrievable (Resend doesn't store inbound, no IMAP configured)

## 5. Recommendations for Next Agent

1. **Kill underperforming subjects** — "The admin you do at 9pm" (1.4%), "Your empty chair is costing you" (0%)
2. **Double down on question format** — "Quick question about your quotes" (11.4%) and "How do you send quotes right now?" (48%) both use direct questions
3. **Send more Step 2** — the click rates are 3-4x higher than Step 1. Prioritise getting Step 1 leads into Step 2.
4. **Set up inbound reply monitoring** — configure Cloudflare Email Routing to forward to a readable inbox, or set up himalaya CLI for `team@mail.buildlogg.com`
5. **Keep DMARC at p=none** — don't escalate to quarantine/reject until you've reviewed 2+ weeks of reports
6. **Clean beauty lead data** — all 14 bounces are beauty vertical personal addresses. Consider filtering personal email domains before sending.
7. **Update campaign-summary.md** — the summary in `stats/` is stale (last updated Jun 27). These numbers supersede it.
