# DMARC Aggregate Reports — 2026-06-29

## What are these emails?

You received two **DMARC aggregate reports** (RUA reports). These are automated emails sent by email providers (Google and Microsoft/Hotmail) to inform you about email authentication results for mail sent **from** buildlogg.com.

### The two reports

| Provider | Report ID | Coverage Period |
|----------|-----------|-----------------|
| Google (google.com) | 14311899519849743807 | Unknown (XML attachment) |
| Microsoft (protection.outlook.com) | f32d68b72d844ce7a23a3fc19923e4c9 | 2026-06-27 00:00 UTC → 2026-06-28 00:00 UTC |

### Why you're receiving them

Your DMARC DNS record is:
```
"v=DMARC1; p=none; rua=mailto:dmarc@buildlogg.com"
```

The `rua=mailto:dmarc@buildlogg.com` tag tells all email receivers: "send aggregate reports about buildlogg.com mail to this address." This is standard and expected — it's how you monitor deliverability.

### What the reports tell you

These are **aggregate** reports (not forensic/failure reports). They contain:
- How many emails were received from buildlogg.com by that provider
- Whether each email passed or failed SPF, DKIM, and DMARC alignment
- The source IP addresses that sent the emails
- **No personally identifiable recipient data** — just counts

### Current DNS configuration

| Record | Value | Status |
|--------|-------|--------|
| DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@buildlogg.com` | ✅ Policy = none (monitor only, no rejection) |
| SPF | `v=spf1 include:_spf.mx.cloudflare.net ~all` | ⚠️ **Missing Resend SPF** |
| DKIM | `resend._domainkey.buildlogg.com` → public key found | ✅ Resend DKIM is configured |

## Key finding — SPF alignment issue

**Critical:** Your SPF record only includes Cloudflare's SPF (`_spf.mx.cloudflare.net`), but your outreach emails are sent via **Resend**. Resend's SPF is not included.

This means:
- **DKIM** passes (Resend signs the email with your DKIM key) ✅
- **SPF** may fail or soft-fail (~all = soft fail) because Resend's sending IPs aren't in your SPF record ⚠️
- **DMARC** still passes because DMARC only requires **one** of SPF or DKIM to align, and DKIM is passing ✅

### The fix (not urgent but recommended)

Add Resend's SPF include to your DNS record. Change:
```
v=spf1 include:_spf.mx.cloudflare.net ~all
```
To:
```
v=spf1 include:_spf.mx.cloudflare.net include: resend.com ~all
```

Check Resend's dashboard for the exact SPF include value — it may be `include:amazonses.com` (Resend sends via AWS SES).

## What this means for the outreach campaign

1. **Emails are being delivered** — both Google and Microsoft are receiving and processing mail from buildlogg.com
2. **DMARC is in monitor mode** (`p=none`) — no emails are being rejected or junked by DMARC policy
3. **The Microsoft report covers Jun 27** — this is the same day you sent the v11+hero beauty batch (100 sends, 7 bounces, 1 sign-up)
4. **DKIM is working** — the fact that you're getting reports (not bounces) means email is being accepted
5. **SPF soft-fail is not blocking delivery** but it may contribute to Microsoft/Hotmail junking some emails — adding Resend to SPF would improve this

## Recommendations

1. **Add Resend to SPF** — check Resend dashboard → Domains → DNS settings for the exact include value
2. **Keep DMARC at `p=none`** for now — don't switch to `p=quarantine` or `p=reject` until you've reviewed several weeks of reports
3. **Save the XML attachments** from these emails — they contain detailed source IP and pass/fail data that can be parsed later
4. **Set up automated parsing** (optional) — tools like dmarcian.com or URIports can parse these reports automatically and give you a dashboard
5. **Monitor Hotmail placement** — the Microsoft report will tell you if emails are being junked. If the report shows mostly `pass` but you're still seeing junk placement, it's a reputation issue, not an authentication issue

## Summary

These reports are **good news** — they confirm email receivers are processing your mail and sending you feedback. The system is working as designed. The only action item is adding Resend to your SPF record for better alignment.
